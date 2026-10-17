"use client";

import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main id="main" className="mx-auto max-w-xl px-4 py-12">
      <div className="card space-y-3">
        <h1 className="h2">Something went wrong</h1>
        <p>Sorry, this page couldn&apos;t load. Please try again in a moment.</p>
        <div className="flex flex-wrap gap-3">
          <button type="button" className="btn-primary" onClick={() => reset()}>
            Try again
          </button>
          <a className="btn-secondary" href="/">
            Go to the start page
          </a>
        </div>
        <p className="text-sm text-muted">
          CTR team: the <a className="link" href="/setup-check">setup check</a> page shows whether the app&apos;s settings and database are working.
          {error.digest && <> Error reference: {error.digest}</>}
        </p>
      </div>
    </main>
  );
}
