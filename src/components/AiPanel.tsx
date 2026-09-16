"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/components/TRPCProvider";
import { applyProposal, type ItemChanges } from "@/lib/applyProposal";
import {
  AI_ACTIONS,
  AI_ACTION_LABELS,
  type AiAction,
  type Proposal,
} from "@/server/ai/proposals";

type Props = {
  itemId: string;
  body: string;
  onApply: (changes: ItemChanges) => void;
};

/**
 * Propose-then-accept. The model's output is shown here and only reaches the
 * note when the user presses Apply — nothing is written behind their back.
 */
export function AiPanel({ itemId, body, onApply }: Props) {
  const trpc = useTRPC();
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState<AiAction | null>(null);

  const status = useQuery(trpc.ai.status.queryOptions());

  const run = useMutation(
    trpc.ai.run.mutationOptions({
      onSuccess: (result) => {
        setProposal(result as Proposal);
        setRunning(null);
      },
      onError: (mutationError) => {
        setError(mutationError.message);
        setRunning(null);
      },
    }),
  );

  if (status.data && !status.data.configured) {
    return (
      <div className="border-t border-neutral-800 p-4 text-xs text-neutral-500">
        AI is off — set <code className="text-neutral-400">ANTHROPIC_API_KEY</code>{" "}
        to enable it.
      </div>
    );
  }

  return (
    <div className="space-y-3 border-t border-neutral-800 p-4">
      <div className="flex flex-wrap gap-1.5">
        {AI_ACTIONS.map((action) => (
          <button
            key={action}
            type="button"
            disabled={run.isPending}
            onClick={() => {
              setError(null);
              setProposal(null);
              setRunning(action);
              run.mutate({ id: itemId, action });
            }}
            className="rounded-lg bg-neutral-800 px-2.5 py-1.5 text-xs disabled:opacity-40"
          >
            {running === action ? "Thinking…" : AI_ACTION_LABELS[action]}
          </button>
        ))}
      </div>

      {error ? <p className="text-xs text-red-400">{error}</p> : null}

      {proposal ? (
        <div className="space-y-3 rounded-xl border border-neutral-700 bg-neutral-900/60 p-3">
          <ProposalBody proposal={proposal} />

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                onApply(applyProposal(body, proposal));
                setProposal(null);
              }}
              className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium"
            >
              Apply
            </button>
            <button
              type="button"
              onClick={() => setProposal(null)}
              className="rounded-lg bg-neutral-800 px-3 py-1.5 text-xs"
            >
              Discard
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ProposalBody({ proposal }: { proposal: Proposal }) {
  switch (proposal.action) {
    case "clarify":
      return (
        <div className="space-y-1 text-xs">
          <p className="text-neutral-300">
            <span className="text-neutral-500">File as</span> {proposal.bucket} ·{" "}
            {proposal.kind}
          </p>
          {proposal.nextAction ? (
            <p className="text-neutral-300">
              <span className="text-neutral-500">Next action</span>{" "}
              {proposal.nextAction}
            </p>
          ) : null}
          {proposal.contexts.length > 0 ? (
            <p className="text-violet-400">
              {proposal.contexts.map((context) => `@${context}`).join(" ")}
            </p>
          ) : null}
          <p className="text-neutral-500 italic">{proposal.rationale}</p>
        </div>
      );

    case "breakdown":
      return (
        <ul className="space-y-1 text-xs text-neutral-300">
          {proposal.actions.map((action) => (
            <li key={action}>☐ {action}</li>
          ))}
        </ul>
      );

    case "research":
      return (
        <div className="space-y-2 text-xs">
          <p className="whitespace-pre-wrap text-neutral-300">
            {proposal.markdown}
          </p>
          {proposal.sources.length > 0 ? (
            <ul className="space-y-0.5">
              {proposal.sources.map((source) => (
                <li key={source.url}>
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-violet-400 underline"
                  >
                    {source.title}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      );

    case "summarize":
      return (
        <p className="whitespace-pre-wrap text-xs text-neutral-300">
          {proposal.summary}
        </p>
      );
  }
}
