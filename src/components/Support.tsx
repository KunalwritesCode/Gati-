import { useState, type MouseEvent } from 'react';
import { Coffee } from 'lucide-react';
import { UPI_ID, UPI_NAME } from '../config';
import { upiLink } from '../lib/upi';
import { cx } from './ui';

export function MadeWith({ className = 'text-[13px] text-muted' }: { className?: string }) {
  return <p className={className}>Made with Love for Students of IIT Gandhinagar</p>;
}

/**
 * On Android the UPI link opens the phone's UPI app chooser. Anywhere else (iPhone, laptops) a UPI link
 * can't open anything, so the button copies the UPI ID and shows it instead.
 */
export function CoffeeButton({ align = 'center' }: { align?: 'center' | 'start' }) {
  const [note, setNote] = useState<string | null>(null);
  const link = upiLink(UPI_ID, UPI_NAME);
  if (!link) return null;
  const android = /android/i.test(navigator.userAgent);

  const onClick = async (e: MouseEvent<HTMLAnchorElement>) => {
    if (android) return;
    e.preventDefault();
    let copied = false;
    try {
      await navigator.clipboard.writeText(UPI_ID);
      copied = true;
    } catch {
      /* clipboard blocked */
    }
    setNote(copied ? `UPI ID copied: ${UPI_ID}. Paste it in any UPI app.` : `Pay this UPI ID in any UPI app: ${UPI_ID}`);
  };

  return (
    <div className={cx('flex flex-col gap-2', align === 'center' ? 'items-center' : 'items-start')}>
      <a href={link} onClick={onClick} className="inline-flex h-10 items-center gap-2 rounded-full bg-surface px-4 text-[14px] font-medium text-ink ring-1 ring-line transition-colors hover:bg-sunken">
        <Coffee size={16} className="text-notice" />
        Buy Me a Coffee
      </a>
      {note && (
        <p role="status" className={cx('max-w-[260px] text-[12px] leading-snug text-muted', align === 'center' && 'text-center')}>
          {note}
        </p>
      )}
    </div>
  );
}
