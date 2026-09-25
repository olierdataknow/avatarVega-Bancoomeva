let quickReplies = [
  "Let me take a look.",
  "Let me check.",
  "One moment, please.",
];

export function htmlEncode(text) {
  const entityMap = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
    "/": "&#x2F;",
  };

  return String(text).replace(/[&<>"'/]/g, (match) => entityMap[match]);
}

export function getQuickReply() {
  return quickReplies[Math.floor(Math.random() * quickReplies.length)];
}
