"use client";

interface SignalRatingProps {
  value: number;
  onChange: (value: number) => void;
  size?: "sm" | "md";
}

export default function SignalRating({ value, onChange, size = "md" }: SignalRatingProps) {
  const starSize = size === "sm" ? "text-sm" : "text-lg";

  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          onClick={() => onChange(star === value ? 0 : star)}
          className={`${starSize} transition-colors ${
            star <= value ? "text-yellow-400" : "text-[var(--border)] hover:text-yellow-400/50"
          }`}
        >
          ★
        </button>
      ))}
    </div>
  );
}
