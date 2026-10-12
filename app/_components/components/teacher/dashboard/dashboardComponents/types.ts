"use client";

export interface TeacherDashboardData {
  profile: {
    name: string;
  };
  stats: {
    totalClasses: number;
    totalStudents: number;
    pendingChats: number;
    unreadAlerts: number;
  };
  circulars: Array<{
    id: string;
    referenceNumber: string;
    subject: string;
    content: string;
    publishStatus: string;
    date: string;
    issuedBy?: string;
    issuedByPhoto?: string | null;
    attachments?: string[];
  }>;
  events: Array<{
    id: string;
    title: string;
    type: string;
    eventDate?: string | null;
  }>;
  notifications: Array<{
    id: string;
    title: string;
    message: string;
    type: string;
    createdAt: string;
  }>;
  recentChats: Array<{
    id: string;
    parentName: string;
    studentName: string;
    status: string;
    note: string;
    createdAt: string;
  }>;
}
