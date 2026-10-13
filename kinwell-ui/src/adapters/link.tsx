/**
 * Stand-in for `next/link`. Renders a normal <a> and navigates client-side with the History API.
 * Using React Router? Replace the body with `<RouterLink to={href} replace={replace} {...rest} />`.
 */
import type { AnchorHTMLAttributes, Ref } from "react";
import { navigate } from "./navigation";

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string;
  replace?: boolean;
  prefetch?: boolean;
  scroll?: boolean;
  ref?: Ref<HTMLAnchorElement>;
};

export default function Link({ href, replace, prefetch: _prefetch, scroll: _scroll, onClick, ...rest }: LinkProps) {
  return (
    <a
      href={href}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || rest.target || /^(https?:|mailto:|tel:)/.test(href)) return;
        e.preventDefault();
        navigate(href, { replace });
      }}
      {...rest}
    />
  );
}
