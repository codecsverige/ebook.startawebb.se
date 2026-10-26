"use client";
import { useEffect, useRef } from "react";
import { X } from "lucide-react";
export function Dialog({
  children,
  title,
  onClose,
  closeLabel,
}: {
  children: React.ReactNode;
  title: string;
  onClose: () => void;
  closeLabel: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    const prior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prior;
      d?.close();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-label={title}
    >
      <div className="modal-header">
        <h2>{title}</h2>
        <button
          type="button"
          className="icon-button"
          onClick={onClose}
          aria-label={closeLabel}
        >
          <X size={21} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
