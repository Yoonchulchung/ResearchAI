export const markdownComponents = {
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) =>
    <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
};
