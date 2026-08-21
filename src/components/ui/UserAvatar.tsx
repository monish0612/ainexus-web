import clsx from 'clsx';
import { useProfilePhotoStore } from '@/store/profilePhotoStore';

export function UserAvatar({
  username,
  onClick,
  size = 40,
  className,
}: {
  username: string;
  onClick?: () => void;
  size?: number;
  className?: string;
}) {
  const url = useProfilePhotoStore((s) => s.url);
  const initial = (username.trim()[0] || 'N').toUpperCase();
  const inner = url ? (
    <img src={url} alt="" className="h-full w-full object-cover" />
  ) : (
    <span className="grid h-full w-full place-items-center">{initial}</span>
  );

  const cls = clsx(
    'overflow-hidden rounded-full bg-gradient-to-br from-accent to-accent-2 text-sm font-bold text-white shadow-glow ring-2 ring-accent/30',
    onClick && 'transition hover:scale-105',
    className,
  );
  const style = { width: size, height: size };

  if (!onClick) {
    return (
      <div className={cls} style={style} aria-hidden>
        {inner}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cls}
      style={style}
      aria-label="Open settings"
    >
      {inner}
    </button>
  );
}
