import { maxTitleLength } from "@tranzfer/contracts";

// The files a pick or drop hands over, before anything is created for them.

const SKIPPED = /^\.DS_Store$|^Thumbs\.db$/u;
const isSkipped = (path: string) =>
  path.split("/").some((segment) => SKIPPED.test(segment) || segment.startsWith("._"));

export interface ChosenFile {
  readonly file: File;
  readonly path: string;
}

// relativePath covers drops and webkitRelativePath folder picks; both are ""
// on plain picks, so an empty relative path falls through to the file name.
export const chosenPath = (file: File & { relativePath?: string }) => {
  const relative = file.relativePath ?? file.webkitRelativePath;
  return (relative === undefined || relative === "" ? file.name : relative).replace(/^\/+/u, "");
};

export const chosenFiles = (files: Iterable<File>) => {
  const chosen: ChosenFile[] = [];
  for (const file of files) {
    const path = chosenPath(file);
    if (path !== "" && !isSkipped(path)) {
      chosen.push({ file, path });
    }
  }
  return chosen;
};

// A name can be longer than a title may be, so the title is cut to fit. A cut
// through a surrogate pair would leave half a character, so the half goes too.
const fitTitle = (title: string) =>
  title.length <= maxTitleLength
    ? title
    : `${title.slice(0, maxTitleLength - 1).replace(/[\uD800-\uDBFF]$/u, "")}…`;

export const deliveryTitle = (files: readonly ChosenFile[]) => {
  const [first] = files;
  if (first === undefined) {
    return "Delivery";
  }
  const [top] = first.path.split("/");
  if (files.length > 1 && files.every(({ path }) => path.startsWith(`${top}/`))) {
    return fitTitle(top ?? "Delivery");
  }
  if (files.length === 1) {
    return fitTitle(first.file.name);
  }
  return fitTitle(`${first.file.name} and ${files.length - 1} more`);
};

export { getDroppedFiles } from "@uppy/core/utils";
