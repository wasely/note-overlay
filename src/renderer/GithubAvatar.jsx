import React, { useEffect, useState } from "react";
import { siGithub } from "simple-icons";

export function GithubAvatar({ account, size = 32, className = "" }) {
  const [failed, setFailed] = useState(false);
  const source = account?.avatarUrl || account?.avatar_url || "";

  useEffect(() => setFailed(false), [source]);

  return <span className={`github-avatar ${className}`.trim()} style={{ width: size, height: size }} aria-hidden="true">
    {source && !failed
      ? <img src={source} alt="" width={size} height={size} draggable="false" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      : <svg viewBox="0 0 24 24" width={Math.max(14, Math.round(size * .58))} height={Math.max(14, Math.round(size * .58))}><path fill="currentColor" d={siGithub.path} /></svg>}
  </span>;
}
