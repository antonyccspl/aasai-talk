import { readFile, writeFile } from "node:fs/promises";

const indexPath = new URL("../dist/index.html", import.meta.url);
const metadata = [
  '<link rel="manifest" href="/manifest.json" />',
  '<link rel="apple-touch-icon" href="/aasai-talk-icon.png" />',
  '<meta name="apple-mobile-web-app-capable" content="yes" />',
  '<meta name="apple-mobile-web-app-title" content="Aasai Talk" />',
  '<meta name="apple-mobile-web-app-status-bar-style" content="default" />',
  '<meta name="theme-color" content="#285647" />',
];

const html = await readFile(indexPath, "utf8");
const alreadyInjected = metadata.every((tag) => html.includes(tag));
if (alreadyInjected) {
  console.log("PWA metadata is already present in dist/index.html.");
} else {
  if (metadata.some((tag) => html.includes(tag)))
    throw new Error("dist/index.html contains incomplete PWA metadata.");
  const headEnd = html.indexOf("</head>");
  if (headEnd < 0)
    throw new Error("Could not find </head> in dist/index.html.");

  const updatedHtml =
    html.slice(0, headEnd) +
    `    ${metadata.join("\n    ")}\n  ` +
    html.slice(headEnd);
  await writeFile(indexPath, updatedHtml);
  console.log("Added PWA metadata to dist/index.html.");
}
