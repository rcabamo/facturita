import { useEffect, useRef, useState } from "react";
import { formatNumber } from "../lib/format";

export function ClientNameInput({
  value,
  placeholder,
  disabled,
  onCommit,
}: {
  value: string;
  placeholder: string;
  disabled?: boolean;
  onCommit: (value: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setText(value);
  }, [value, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  if (!editing) {
    return (
      <button
        type="button"
        className="inline-value name"
        disabled={disabled}
        onClick={() => setEditing(true)}
        title="Editar nombre"
      >
        {value ? value : <span className="muted">{placeholder}</span>}
      </button>
    );
  }

  return (
    <input
      ref={inputRef}
      className="name-input"
      value={text}
      placeholder={placeholder}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        setEditing(false);
        onCommit(text);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setText(value);
          setEditing(false);
        }
      }}
    />
  );
}

export function InlineNumberValue({
  value,
  symbol,
  disabled,
  onCommit,
}: {
  value: number;
  symbol: string;
  disabled?: boolean;
  onCommit: (value: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function commit() {
    setEditing(false);
    const trimmed = text.trim();
    if (trimmed === "") return;
    const parsed = Number(trimmed.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 0) return;
    if (parsed !== value) onCommit(parsed);
  }

  if (!editing) {
    return (
      <button
        type="button"
        className="inline-value"
        disabled={disabled}
        onClick={() => {
          setText(String(value));
          setEditing(true);
        }}
        title="Editar"
      >
        {formatNumber(value)} <span className="muted">{symbol}</span>
      </button>
    );
  }

  return (
    <input
      ref={inputRef}
      className="settings-input"
      inputMode="decimal"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") setEditing(false);
      }}
    />
  );
}

export function InlineTextValue({
  value,
  placeholder,
  disabled,
  onCommit,
}: {
  value: string;
  placeholder: string;
  disabled?: boolean;
  onCommit: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  if (!editing) {
    return (
      <button
        type="button"
        className="inline-value"
        disabled={disabled}
        onClick={() => {
          setText(value);
          setEditing(true);
        }}
        title="Editar"
      >
        {value || <span className="muted">{placeholder}</span>}
      </button>
    );
  }

  return (
    <input
      ref={inputRef}
      className="settings-input"
      value={text}
      placeholder={placeholder}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        setEditing(false);
        const trimmed = text.trim();
        if (trimmed && trimmed !== value) onCommit(trimmed);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") setEditing(false);
      }}
    />
  );
}
