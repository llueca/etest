import { useEffect, useRef, useState } from "react";

/** Announces the feed being lost and restored (spoken only, once per change). */
export function useFeedAnnouncement(fresh: boolean): string {
  const [message, setMessage] = useState("");
  const hadFresh = useRef(false);
  const lost = useRef(false);
  useEffect(() => {
    if (fresh) {
      if (lost.current) setMessage("Live data restored.");
      hadFresh.current = true;
      lost.current = false;
    } else if (hadFresh.current) {
      setMessage("Live data lost.");
      lost.current = true;
    }
  }, [fresh]);
  return message;
}
