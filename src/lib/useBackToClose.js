import { useEffect, useRef } from 'react';

// Makes the phone's/browser's back button close an open detail card instead of doing
// whatever it would otherwise do (nothing, since neither opening a card nor switching a
// pill filter pushes any history entry — so "back" was falling through to the actual
// previous page in history, or on some mobile browsers appeared to just re-render the
// page in an earlier state, which read as "back reverted my pill selection").
//
// Call the returned `close` function from every place that closes the card (the "‹ Back"
// button, an overlay click, etc.) instead of calling your close-state setter directly —
// that keeps one pushState paired with exactly one close, so back never takes two presses
// to actually leave the page.
//
// Cards can sit on top of each other (a pupil's card, then their Islamic Studies over it): each history entry
// carries its depth, and back closes only the card whose entry was popped — the top one.
export function useBackToClose(isOpen, onClose) {
  const pushedRef = useRef(false);
  const depthRef = useRef(0);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (isOpen && !pushedRef.current) {
      depthRef.current = (window.history.state?.__depth || 0) + 1;
      window.history.pushState({ __card: true, __depth: depthRef.current }, '');
      pushedRef.current = true;
    }
  }, [isOpen]);

  useEffect(() => {
    function handlePopState(e) {
      if (pushedRef.current && (e.state?.__depth || 0) < depthRef.current) {
        pushedRef.current = false;
        onCloseRef.current();
      }
    }
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  return function close() {
    if (pushedRef.current) {
      window.history.back();
    } else {
      onCloseRef.current();
    }
  };
}
