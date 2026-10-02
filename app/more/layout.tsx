import BottomNav from "../components/bottom-nav";

export default function MoreLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <><div className="more-route-shell">{children}</div><BottomNav /></>;
}
