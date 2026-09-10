import BottomNav from "../components/bottom-nav";

export default function MoreLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <>{children}<BottomNav /></>;
}
