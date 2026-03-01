import { MomentumDashboard } from "@/components/momentum/MomentumDashboard";
import { MomentumProvider } from "@/context/MomentumContext";

export default function Home() {
  return (
    <MomentumProvider>
      <MomentumDashboard />
    </MomentumProvider>
  );
}
