// unplugin-icons' bundled Solid shim predates Solid 2 (`ComponentProps<"svg">`
// resolves to never), so the virtual modules are typed here instead.
declare module "~icons/*" {
  import type { JSX } from "@solidjs/web";

  const component: (props: JSX.SvgSVGAttributes<SVGSVGElement>) => JSX.Element;
  export default component;
}
