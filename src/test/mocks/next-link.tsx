/**
 * Mock for next/link in browser tests.
 *
 * Renders a plain <a> tag — enough for layout/styling assertions without
 * requiring the Next.js router infrastructure.
 */

interface MockLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  children: React.ReactNode;
}

export default function MockLink({ href, children, ...props }: MockLinkProps) {
  return (
    <a href={href} {...props}>
      {children}
    </a>
  );
}
