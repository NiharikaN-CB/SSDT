import Sidebar from "../components/sidebar";
import Header from "../components/header";
import ScanForm from "../components/scanform";
import ReportCard from "../components/reportcard";

const Dashboard = () => (
  <div style={{ display: "flex", height: "100vh", backgroundColor: "#111827" }}>
    <Sidebar />
    <div style={{ flex: 1, padding: "20px", color: "white" }}>
      <Header />
      <ScanForm />
      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginTop: "20px" }}>
        <ReportCard title="IP Info" value="192.168.1.1" />
        <ReportCard title="SSL Status" value="Valid" />
        <ReportCard title="DNS Records" value="Fetched" />
      </div>
    </div>
  </div>
);

export default Dashboard;
