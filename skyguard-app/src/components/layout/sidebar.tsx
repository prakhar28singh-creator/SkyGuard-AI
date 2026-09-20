import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  CloudSun,
  AlertTriangle,
  Radio,
  BarChart3,
  Wrench,
  Settings,
  LogOut,
  Menu,
  X,
  Activity,
  Bell,
  Info,
  MessageSquare,
  Cpu,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const navItems = [
  { to: "/overview",     icon: LayoutDashboard, label: "Dashboard" },
  { to: "/stations",     icon: Radio,            label: "Weather Stations" },
  { to: "/network",      icon: CloudSun,         label: "Real-time Weather" },
  { to: "/analytics",    icon: Activity,         label: "Sensor Health" },
  { to: "/anomalies",    icon: AlertTriangle,    label: "Anomalies" },
  { to: "/alerts",       icon: Bell,             label: "Alerts" },
  { to: "/maintenance",  icon: Wrench,           label: "Maintenance" },
  { to: "/edge-nodes",   icon: Cpu,              label: "Edge AI Node" },
  { to: "/complaints",   icon: MessageSquare,    label: "Complaints" },
  { to: "/reports",      icon: BarChart3,        label: "Reports" },
];

const bottomNav = [
  { to: "/settings",   icon: Settings, label: "Settings" },
  { to: "/about",      icon: Info,     label: "About System" },
];

export function Sidebar() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const [collapsed, setCollapsed] = useState(() => window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) setCollapsed(true);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (!(isMobile && !collapsed)) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCollapsed(true);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isMobile, collapsed]);

  const mobileOpen = isMobile && !collapsed;
  const expanded = !collapsed;

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/50 backdrop-blur-[1px]"
          aria-hidden="true"
          onClick={() => setCollapsed(true)}
        />
      )}
      <aside
        aria-label="Sidebar"
        className={cn(
          "z-40 flex flex-col bg-[#0d1f3c] text-white shadow-[2px_0_16px_rgba(0,0,0,0.35)] transition-all duration-300",
          mobileOpen ? "fixed inset-y-0 left-0 w-64" : "relative w-[68px]",
          !isMobile && (collapsed ? "w-[68px]" : "w-64")
        )}
      >
        {/* Logo / Brand */}
        <div
          className={cn(
            "flex items-center border-b border-white/10 py-4",
            expanded ? "justify-between px-4" : "flex-col gap-2.5"
          )}
        >
          {expanded ? (
            <div className="flex items-center gap-2">
              <img src="/skyguard-mark.svg" alt="" className="h-9 w-9" />
              <div className="leading-tight">
                <p className="text-[15px] font-extrabold tracking-wider text-white">SkyGuard</p>
                <p className="text-[10px] font-medium uppercase tracking-widest text-sky-300/80">AI Monitoring</p>
              </div>
            </div>
          ) : (
            <img src="/skyguard-mark.svg" alt="SkyGuard AI" className="h-9 w-9" />
          )}
          <Button
            variant="ghost"
            size="icon"
            aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
            aria-expanded={expanded}
            className="h-10 w-10 shrink-0 rounded-lg text-slate-300 hover:bg-white/8"
            onClick={() => setCollapsed(!collapsed)}
          >
            {expanded ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </Button>
        </div>

        {/* Primary Nav */}
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2.5 py-3">
          {navItems.map((item) => (
            <NavLink
              key={`${item.to}-${item.label}`}
              to={item.to}
              onClick={() => isMobile && setCollapsed(true)}
              className={({ isActive }) =>
                cn(
                  "flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all duration-150",
                  isActive
                    ? "bg-[#1e6bdc] text-white shadow-[0_2px_12px_rgba(30,107,220,0.4)]"
                    : "text-slate-300 hover:bg-white/8 hover:text-white"
                )
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon className={cn("h-5 w-5 shrink-0", isActive ? "text-white" : "text-slate-400")} />
                  {expanded && <span>{item.label}</span>}
                </>
              )}
            </NavLink>
          ))}

          {/* Divider */}
          <div className="my-2 border-t border-white/8" />

          {/* Bottom nav items */}
          {bottomNav.map((item) => (
            <NavLink
              key={`${item.to}-${item.label}`}
              to={item.to}
              onClick={() => isMobile && setCollapsed(true)}
              className={({ isActive }) =>
                cn(
                  "flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all duration-150",
                  isActive
                    ? "bg-[#1e6bdc] text-white shadow-[0_2px_12px_rgba(30,107,220,0.4)]"
                    : "text-slate-300 hover:bg-white/8 hover:text-white"
                )
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon className={cn("h-5 w-5 shrink-0", isActive ? "text-white" : "text-slate-400")} />
                  {expanded && <span>{item.label}</span>}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Logout */}
        <div className="border-t border-white/10 p-2.5">
          <NavLink
            to="/login"
            onClick={() => isMobile && setCollapsed(true)}
            className="flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium text-slate-300 transition-all duration-150 hover:bg-white/8 hover:text-white"
          >
            <LogOut className="h-5 w-5 shrink-0 text-slate-400" />
            {expanded && <span>Logout</span>}
          </NavLink>
        </div>
      </aside>
    </>
  );
}