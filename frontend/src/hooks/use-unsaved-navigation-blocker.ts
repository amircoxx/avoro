/** Blocks navigation and browser unload while a profile editor owns unsaved changes. */
import { useEffect } from "react";
import { useBlocker } from "react-router-dom";

const DISCARD_MESSAGE = "Discard unsaved profile changes?";

export function useUnsavedNavigationBlocker(
  shouldBlock: boolean,
  { confirm, onDiscard }: { confirm: (message: string) => boolean; onDiscard: () => void }
) {
  const blocker = useBlocker(shouldBlock);

  useEffect(() => {
    if (blocker.state !== "blocked") return;
    if (confirm(DISCARD_MESSAGE)) {
      onDiscard();
      blocker.proceed();
      return;
    }
    blocker.reset();
  }, [blocker, confirm, onDiscard]);
}
