import {
    Home,
    Plus,
    Users,
    UserCheck,
    Trash2,
    Settings2,
    CreditCard,
    LogOut,
    LayoutDashboard,
    DollarSign,
    Settings,
} from "lucide-react";
import { SidebarItem } from "../../types/sidebar";
import { Permission } from "../../enums/permissions";

export const SUPERADMIN_SIDEBAR_ITEMS: SidebarItem[] = [
    {
        label: "Dashboard",
        href: "/superadmin",
        tab: "dashboard",
        icon: Home,
        permission: Permission.DASHBOARD,
    },
    {
        label: "Add School",
        mobileLabel: "Add",
        href: "/superadmin?tab=addschool",
        tab: "addschool",
        icon: Plus,
        permission: Permission.ADD_SCHOOL,
    },
    {
        label: "Schools",
        href: "/superadmin?tab=schools",
        tab: "schools",
        icon: Users,
        permission: Permission.SCHOOLS,
    },
    {
        label: "Add Chairman",
        mobileLabel: "Chairman",
        href: "/superadmin?tab=addchairman",
        tab: "addchairman",
        icon: UserCheck,
        permission: Permission.SCHOOLS,
    },
    {
        label: "Remove schools",
        mobileLabel: "Remove",
        href: "/superadmin?tab=removeschools",
        tab: "removeschools",
        icon: Trash2,
        permission: Permission.SCHOOLS,
    },
    {
        label: "Subscriptions",
        href: "/superadmin?tab=subscriptions",
        tab: "subscriptions",
        icon: Settings2,
        permission: Permission.SCHOOLS,
    },
    {
        label: "Fees Transactions",
        mobileLabel: "Fees",
        href: "/superadmin?tab=transactions",
        tab: "transactions",
        icon: CreditCard,
        permission: Permission.FEES_TRANSACTIONS,
    },
    {
        label: "Sign Out",
        action: "logout",
        icon: LogOut,
    },
];

export const CHAIRMAN_MENU_ITEMS: SidebarItem[] = [
    {
        label: "Dashboard",
        tab: "dashboard",
        href: "/chairman?tab=dashboard",
        icon: LayoutDashboard,
        permission: Permission.DASHBOARD,
    },
    {
        label: "Discount Approvals",
        tab: "discount-approvals",
        href: "/chairman?tab=discount-approvals",
        icon: DollarSign,
        permission: Permission.FEES,
    },
    {
        label: "Settings",
        tab: "settings",
        href: "/chairman?tab=settings",
        icon: Settings,
        permission: Permission.SETTINGS,
    },
    {
        label: "Sign Out",
        action: "logout",
        icon: LogOut,
    },
];
