'use client';

import { useNotifications } from '@/hooks/useNotification';
import { useState } from 'react';

export default function NotificationBell() {
    const [open, setOpen] = useState(false);
    const { notifications, unreadCount, loading, markAsRead, markAllAsRead, fetchNotifications } =
        useNotifications();

    const handleOpen = () => {
        setOpen((prev) => !prev);
        if (!open) fetchNotifications();
    };

    return (
        <div className="relative">
            {/* Bell Button */}
            <button onClick={handleOpen} className="relative p-2 rounded-full hover:bg-gray-100">
                <span className="text-xl">🔔</span>
                {unreadCount > 0 && (
                    <span className="absolute top-0 right-0 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            {/* Dropdown */}
            {open && (
                <div className="absolute right-0 mt-2 w-80 bg-white border border-gray-200 rounded-xl shadow-lg z-50">
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b">
                        <h3 className="font-semibold text-gray-800">Notifications</h3>
                        {unreadCount > 0 && (
                            <button
                                onClick={markAllAsRead}
                                className="text-xs text-blue-500 hover:underline"
                            >
                                Mark all as read
                            </button>
                        )}
                    </div>

                    {/* List */}
                    <ul className="max-h-80 overflow-y-auto divide-y divide-gray-100">
                        {loading && (
                            <li className="px-4 py-3 text-sm text-gray-400">Loading...</li>
                        )}
                        {!loading && notifications.length === 0 && (
                            <li className="px-4 py-3 text-sm text-gray-400">No notifications</li>
                        )}
                        {notifications.map((n) => (
                            <li
                                key={n.id}
                                onClick={() => !n.isRead && markAsRead(n.id)}
                                className={`px-4 py-3 text-sm cursor-pointer hover:bg-gray-50 transition ${!n.isRead ? 'bg-blue-50 font-medium' : 'text-gray-600'
                                    }`}
                            >
                                <p>{n.message}</p>
                                <span className="text-xs text-gray-400 mt-1 block">
                                    {new Date(n.createdAt).toLocaleString()}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}