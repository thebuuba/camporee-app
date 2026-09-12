import BottomNav from "../components/bottom-nav";
import MoreSheetBehavior from "../components/more-sheet-behavior";

export default function MoreLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <><div className="more-route-shell">{children}<MoreSheetBehavior/></div><BottomNav /></>;
}
