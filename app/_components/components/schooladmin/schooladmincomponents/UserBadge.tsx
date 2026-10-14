"use client";

interface UserBadgeProps {
  name: string;
  email: string;
  imageUrl?: string | null;
}

export default function UserBadge({ name, email, imageUrl }: UserBadgeProps) {
  return (
    <div className="flex items-center gap-3">
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={name}
          className="w-10 h-10 rounded-full object-cover border-2 border-white/10"
        />
      ) : (
        <div className="w-10 h-10 rounded-full bg-lime-400/20 flex items-center justify-center text-lime-400 font-bold text-sm flex-shrink-0">
          {name?.charAt(0).toUpperCase()}
        </div>
      )}
      <div className="min-w-0">
        <div className="text-sm font-medium text-gray-200">{name}</div>
        <div className="text-xs text-gray-500">{email}</div>
      </div>
    </div>
  );
}
