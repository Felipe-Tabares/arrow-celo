import { FC, ReactNode } from "react";

interface Props {
  children: ReactNode;
}
const Layout: FC<Props> = ({ children }) => {
  return <div className="min-h-screen bg-[#0a0a0f]">{children}</div>;
};

export default Layout;
