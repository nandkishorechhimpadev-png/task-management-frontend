// components/Navbar.tsx
import NotificationBell from '@/components/NotificationBell';

export default function Navbar() {
    return (
        <nav className="flex items-center justify-between px-6 py-4 border-b">
            <span className="font-bold">TaskApp</span>
            <div className="flex items-center gap-4">
                <NotificationBell />
                {/* avatar, logout etc */}
            </div>
        </nav>
    );
}