#!/usr/bin/env python3
"""Unified CLI for NotebookLM operations.

Usage:
    python notebooklm-cli.py <subcommand> [options]

Subcommands:
    add-source       Push text content as a source (reads from stdin)
    guide            Get per-source summary/guide
    generate         Generate quiz or flashcards (source-scoped)
    generate-audio   Generate and download audio overview
    ask              Q&A with conversation continuity
    delete-source    Remove a source from a notebook

All output is JSON to stdout.

Prerequisites:
    pip install notebooklm-py
    notebooklm login  # one-time browser auth
"""

import argparse
import asyncio
import json
import sys


# ---------------------------------------------------------------------------
# Normalizers
# ---------------------------------------------------------------------------

def normalize_quiz(raw_quiz) -> list:
    """Normalize NotebookLM quiz items to {question, options, answer, explanation}."""
    result = []
    items = raw_quiz if isinstance(raw_quiz, list) else getattr(raw_quiz, "questions", raw_quiz) or []
    for item in items:
        # Support both dict and object access
        def get(obj, *keys, default=None):
            for k in keys:
                try:
                    v = obj[k] if isinstance(obj, dict) else getattr(obj, k, None)
                    if v is not None:
                        return v
                except (KeyError, TypeError):
                    pass
            return default

        question = get(item, "question", "stem", default="")
        explanation = get(item, "explanation", "rationale", default="")
        answer_options = get(item, "answerOptions", "options", default=[])

        options = []
        answer_index = 0
        for i, opt in enumerate(answer_options):
            text = get(opt, "text", "label", default=str(opt))
            options.append(text)
            if get(opt, "isCorrect", "correct", default=False):
                answer_index = i

        result.append({
            "question": question,
            "options": options,
            "answer": answer_index,
            "explanation": explanation,
        })
    return result


def normalize_flashcards(raw_cards) -> list:
    """Normalize NotebookLM flashcard items to {front, back}."""
    result = []
    items = raw_cards if isinstance(raw_cards, list) else getattr(raw_cards, "cards", raw_cards) or []
    for item in items:
        def get(obj, *keys, default=None):
            for k in keys:
                try:
                    v = obj[k] if isinstance(obj, dict) else getattr(obj, k, None)
                    if v is not None:
                        return v
                except (KeyError, TypeError):
                    pass
            return default

        front = get(item, "front", "f", default="")
        back = get(item, "back", "b", default="")
        result.append({"front": front, "back": back})
    return result


def normalize_guide(raw_guide) -> dict:
    """Extract summary and keywords from a guide/source overview."""
    def get(obj, *keys, default=None):
        for k in keys:
            try:
                v = obj[k] if isinstance(obj, dict) else getattr(obj, k, None)
                if v is not None:
                    return v
            except (KeyError, TypeError):
                pass
        return default

    summary = get(raw_guide, "summary", "overview", "description", default="")
    keywords = get(raw_guide, "keywords", "key_concepts", "topics", default=[])
    if isinstance(keywords, str):
        keywords = [k.strip() for k in keywords.split(",") if k.strip()]
    return {"summary": summary, "keywords": keywords}


# ---------------------------------------------------------------------------
# Subcommand handlers
# ---------------------------------------------------------------------------

async def cmd_add_source(client, args):
    content = sys.stdin.read().strip()
    if not content:
        return {"error": "No content provided via stdin"}

    source = await client.sources.add_text(args.notebook_id, args.title, content)
    return {"success": True, "source_id": source.id, "title": source.title}


async def cmd_guide(client, args):
    guide = await client.sources.get_guide(args.notebook_id, args.source_id)
    normalized = normalize_guide(guide)
    return {"success": True, "source_id": args.source_id, **normalized}


async def cmd_generate(client, args):
    if args.type == "quiz":
        raw = await client.sources.generate_quiz(args.notebook_id, args.source_id)
        return {"success": True, "type": "quiz", "items": normalize_quiz(raw)}
    elif args.type == "flashcards":
        raw = await client.sources.generate_flashcards(args.notebook_id, args.source_id)
        return {"success": True, "type": "flashcards", "items": normalize_flashcards(raw)}
    else:
        return {"error": f"Unknown type: {args.type}. Must be quiz or flashcards"}


async def cmd_generate_audio(client, args):
    audio = await client.notebooks.generate_audio(args.notebook_id)
    output_path = args.output
    # audio may be bytes or an object with .content / .data
    if isinstance(audio, (bytes, bytearray)):
        data = audio
    else:
        data = getattr(audio, "content", None) or getattr(audio, "data", None) or bytes(audio)
    with open(output_path, "wb") as f:
        f.write(data)
    return {"success": True, "output": output_path, "bytes": len(data)}


async def cmd_ask(client, args):
    kwargs = {}
    if args.conversation_id:
        kwargs["conversation_id"] = args.conversation_id
    response = await client.chat.ask(args.notebook_id, args.question, **kwargs)
    # response may be object or dict
    def get(obj, *keys, default=None):
        for k in keys:
            try:
                v = obj[k] if isinstance(obj, dict) else getattr(obj, k, None)
                if v is not None:
                    return v
            except (KeyError, TypeError):
                pass
        return default

    answer = get(response, "answer", "text", "content", default=str(response))
    conversation_id = get(response, "conversation_id", "conversationId", default=None)
    result = {"success": True, "answer": answer}
    if conversation_id:
        result["conversation_id"] = conversation_id
    return result


async def cmd_delete_source(client, args):
    await client.sources.delete(args.notebook_id, args.source_id)
    return {"success": True, "source_id": args.source_id}


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

async def run(args):
    try:
        from notebooklm import NotebookLMClient
    except ImportError:
        return {"error": "notebooklm-py not installed. Run: pip install notebooklm-py"}, 1

    try:
        async with await NotebookLMClient.from_storage() as client:
            handler = {
                "add-source": cmd_add_source,
                "guide": cmd_guide,
                "generate": cmd_generate,
                "generate-audio": cmd_generate_audio,
                "ask": cmd_ask,
                "delete-source": cmd_delete_source,
            }[args.subcommand]
            result = await handler(client, args)
            if "error" in result:
                return result, 1
            return result, 0
    except FileNotFoundError:
        return {"error": "Not logged in. Run: notebooklm login"}, 1
    except Exception as e:
        return {"error": str(e)}, 1


def build_parser():
    parser = argparse.ArgumentParser(
        description="Unified CLI for NotebookLM operations",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    sub = parser.add_subparsers(dest="subcommand", required=True, metavar="<subcommand>")

    # add-source
    p = sub.add_parser("add-source", help="Push text content as a source (reads from stdin)")
    p.add_argument("--notebook-id", required=True, help="Target notebook ID")
    p.add_argument("--title", required=True, help="Source title")

    # guide
    p = sub.add_parser("guide", help="Get per-source summary/guide")
    p.add_argument("--notebook-id", required=True, help="Notebook ID")
    p.add_argument("--source-id", required=True, help="Source ID")

    # generate
    p = sub.add_parser("generate", help="Generate quiz or flashcards (source-scoped)")
    p.add_argument("--notebook-id", required=True, help="Notebook ID")
    p.add_argument("--type", required=True, choices=["quiz", "flashcards"], help="Content type to generate")
    p.add_argument("--source-id", required=True, help="Source ID")

    # generate-audio
    p = sub.add_parser("generate-audio", help="Generate and download audio overview")
    p.add_argument("--notebook-id", required=True, help="Notebook ID")
    p.add_argument("--output", required=True, help="Output file path for audio")

    # ask
    p = sub.add_parser("ask", help="Q&A with conversation continuity")
    p.add_argument("--notebook-id", required=True, help="Notebook ID")
    p.add_argument("--question", required=True, help="Question to ask")
    p.add_argument("--conversation-id", default=None, help="Existing conversation ID (optional)")

    # delete-source
    p = sub.add_parser("delete-source", help="Remove a source from a notebook")
    p.add_argument("--notebook-id", required=True, help="Notebook ID")
    p.add_argument("--source-id", required=True, help="Source ID")

    return parser


def main():
    parser = build_parser()
    args = parser.parse_args()
    # Convert hyphenated arg names to underscored attributes
    if hasattr(args, "notebook_id") is False and hasattr(args, "notebook-id"):
        args.notebook_id = getattr(args, "notebook-id")
    if hasattr(args, "source_id") is False and hasattr(args, "source-id"):
        args.source_id = getattr(args, "source-id")
    if hasattr(args, "conversation_id") is False and hasattr(args, "conversation-id"):
        args.conversation_id = getattr(args, "conversation-id")

    result, exit_code = asyncio.run(run(args))
    print(json.dumps(result))
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
