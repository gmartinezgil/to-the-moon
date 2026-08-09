import type { ReactNode } from 'react';

export function Pill({
  children,
  onClick,
  dark = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  dark?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      className={`${dark ? 'bg-black text-[#FFDE3A]' : 'bg-white text-black'} rounded-full px-4 py-2 text-xs font-bold inline-block shadow-sm cursor-pointer active:scale-95 transition-transform select-none`}
    >
      {children}
    </div>
  );
}

export function Modal({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="absolute inset-0 bg-black/80 z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-[35px] p-6 w-full shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 font-bold"
        >
          X
        </button>
        <h2 className="text-2xl font-black text-black">{title}</h2>
        {subtitle && <p className="text-xs font-bold text-gray-400 mt-1 mb-4">{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}

export function BigButton({
  children,
  onClick,
  variant = 'dark',
  disabled = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'dark' | 'light' | 'yellow';
  disabled?: boolean;
}) {
  const styles =
    variant === 'light'
      ? 'bg-white text-black border-2 border-black'
      : variant === 'yellow'
        ? 'bg-[#FFDE3A] text-black border-2 border-black'
        : 'bg-black text-[#FFDE3A]';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full ${styles} rounded-full py-4 font-black text-lg active:scale-95 transition-transform ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
    >
      {children}
    </button>
  );
}

export function AmountInput({
  prefix,
  value,
  onChange,
  placeholder = '0.00',
  autoFocus = false,
}: {
  prefix: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <div className="bg-slate-100 rounded-2xl p-4 flex items-center mb-2">
      <span className="font-black text-xl text-slate-400 mr-2">{prefix}</span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="bg-transparent text-3xl font-extrabold text-black outline-none w-full"
      />
    </div>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="font-extrabold text-lg text-black mb-4">{children}</h3>;
}
