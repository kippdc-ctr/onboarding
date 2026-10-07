"use client";

import { useId, useMemo, useRef, useState, useTransition } from "react";
import { createPin, signInStep, verifyPin, SignInState } from "@/app/actions/auth";

type Name = { id: string; name: string };

export function NamePicker({ names }: { names: Name[] }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Name | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [state, setState] = useState<SignInState | null>(null);
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [pinMode, setPinMode] = useState<"create" | "enter" | null>(null);
  const [pending, start] = useTransition();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return names.slice(0, 50);
    return names.filter((n) => n.name.toLowerCase().split(/\s+/).some((w) => w.startsWith(q)) || n.name.toLowerCase().includes(q)).slice(0, 50);
  }, [names, query]);

  function choose(n: Name) {
    setSelected(n);
    setQuery(n.name);
    setOpen(false);
    setState(null);
  }

  function reset() {
    setSelected(null);
    setQuery("");
    setState(null);
    setPin("");
    setPin2("");
    setPinMode(null);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function onContinue() {
    if (!selected) return;
    start(async () => {
      const res = await signInStep(selected.id);
      setState(res);
      if (res.step === "create" || res.step === "enter") setPinMode(res.step);
    });
  }

  const step = state?.step;

  function onSubmitPin(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    start(async () => {
      const res = pinMode === "create" ? await createPin(selected.id, pin, pin2) : await verifyPin(selected.id, pin);
      setState(res);
      if (res.step === "create" || res.step === "enter") setPinMode(res.step);
      if (res.step === "error") {
        setPin("");
        setPin2("");
      }
    });
  }

  if (selected && step === "locked") {
    return (
      <div role="alert" className="rounded-xl border-2 border-coral bg-coral-wash p-4">
        <p className="font-bold">{state && "message" in state ? state.message : ""}</p>
        <button type="button" className="link mt-3" onClick={reset}>
          Choose a different name
        </button>
      </div>
    );
  }

  if (selected && pinMode) {
    return (
      <form onSubmit={onSubmitPin} className="space-y-4">
        <p className="text-lg">
          Hi, <strong>{selected.name}</strong>!{" "}
          <button type="button" className="link text-base" onClick={reset}>
            Not you?
          </button>
        </p>
        {pinMode === "create" ? (
          <p>Create a 4-digit PIN. You&apos;ll use it with your name to sign in. Keep it somewhere safe.</p>
        ) : (
          <p>Enter your 4-digit PIN.</p>
        )}
        <div>
          <label htmlFor="pin" className="label">
            {pinMode === "create" ? "New PIN" : "PIN"}
          </label>
          <input
            id="pin"
            className="input max-w-40 text-center text-2xl tracking-[0.5em]"
            inputMode="numeric"
            autoComplete={pinMode === "create" ? "new-password" : "current-password"}
            type="password"
            pattern="\d{4}"
            maxLength={4}
            required
            autoFocus
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
          />
        </div>
        {pinMode === "create" && (
          <div>
            <label htmlFor="pin2" className="label">
              Enter it again
            </label>
            <input
              id="pin2"
              className="input max-w-40 text-center text-2xl tracking-[0.5em]"
              inputMode="numeric"
              autoComplete="new-password"
              type="password"
              pattern="\d{4}"
              maxLength={4}
              required
              value={pin2}
              onChange={(e) => setPin2(e.target.value.replace(/\D/g, "").slice(0, 4))}
            />
          </div>
        )}
        {step === "error" && state && "message" in state && (
          <p role="alert" className="font-semibold text-coral-ink">
            {state.message}
          </p>
        )}
        <button type="submit" className="btn-primary w-full sm:w-auto" disabled={pending || pin.length !== 4 || (pinMode === "create" && pin2.length !== 4)}>
          {pending ? "Checking…" : pinMode === "create" ? "Save PIN and continue" : "Sign in"}
        </button>
        {pinMode === "enter" && <p className="text-sm text-muted">Forgot your PIN? Contact the CTR team and they can reset it.</p>}
      </form>
    );
  }

  return (
    <div>
      <label htmlFor="name-search" className="label">
        Your name
      </label>
      <div className="relative">
        <input
          id="name-search"
          ref={inputRef}
          className="input"
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && matches[active] ? `${listId}-${active}` : undefined}
          autoComplete="off"
          placeholder="Start typing your first or last name"
          value={query}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(null);
            setOpen(true);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setActive((a) => Math.min(a + 1, matches.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && open && matches[active]) {
              e.preventDefault();
              choose(matches[active]);
            } else if (e.key === "Escape") setOpen(false);
          }}
        />
        {open && !selected && (
          <ul id={listId} role="listbox" className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-xl border-2 border-gray-brand/40 bg-white py-1 shadow-lg">
            {matches.length === 0 && <li className="px-4 py-3 text-muted">No matching names.</li>}
            {matches.map((n, i) => (
              <li
                key={n.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className={`cursor-pointer px-4 py-3 text-lg ${i === active ? "bg-teal-wash" : ""}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(n)}
                onMouseEnter={() => setActive(i)}
              >
                {n.name}
              </li>
            ))}
          </ul>
        )}
      </div>
      {step === "error" && state && "message" in state && (
        <p role="alert" className="mt-2 font-semibold text-coral-ink">
          {state.message}
        </p>
      )}
      <button type="button" className="btn-primary mt-4 w-full sm:w-auto" disabled={!selected || pending} onClick={onContinue}>
        {pending ? "One moment…" : "Continue"}
      </button>
    </div>
  );
}
