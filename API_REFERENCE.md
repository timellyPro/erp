# Backend API Routes Documentation

## Overview

This document covers all backend API routes in the Next.js App Router application. The API uses NextAuth for authentication via session cookies.

### Authentication

- All routes (except `/api/auth/*`) require authentication via `getServerSession(authOptions)`
- Session is stored in HTTP-only cookies
- Unauthorized requests return `401 Unauthorized`
- Role-based access control: `SUPERADMIN`, `SCHOOLADMIN`, `TEACHER`, `STUDENT`

### Common Error Codes

- `400` - Bad Request (missing/invalid parameters)
- `401` - Unauthorized (no session)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `500` - Internal Server Error
- `408` - Request Timeout (transaction timeout)
- `409` - Conflict (duplicate/overlapping data)

### Caching


---

## Authentication

### `GET/POST /api/auth/[...nextauth]`

**Purpose**: NextAuth authentication handler (sign in, sign out, session management)

**Methods**: `GET`, `POST`

**Authentication**: Not required (public)

**Request Body**: N/A (handled by NextAuth)

**Response**: NextAuth responses (session, callback URLs, etc.)

**Notes**: Handles OAuth and credential-based authentication

---

## User Management

### `GET /api/user/me`

**Purpose**: Get current user profile

**Methods**: `GET`

**Authentication**: Required

**Query Params**: None

**Response** (200):
```json
{
  "user": {
    "id": "string",
    "name": "string",
    "email": "string",
    "mobile": "string | null",
    "language": "string | null",
    "photoUrl": "string | null",
    "role": "SUPERADMIN | SCHOOLADMIN | TEACHER | STUDENT"
  }
}
```

**Notes**: Returns authenticated user's profile

---

### `PUT /api/user/me`

**Purpose**: Update current user profile

**Methods**: `PUT`

**Authentication**: Required

**Request Body**:
```json
{
  "mobile": "string | null",
  "language": "string | null",
  "photoUrl": "string | null",
  "name": "string | null"
}
```
All fields optional

**Response** (200): Same as GET `/api/user/me`

**Notes**: Email cannot be updated

---

### `POST /api/user/change-password`

**Purpose**: Change user password

**Methods**: `POST`

**Authentication**: Required

**Request Body**:
```json
{
  "currentPassword": "string",
  "newPassword": "string"
}
```

**Response** (200):
```json
{
  "message": "Password updated"
}
```

**Error Cases**:
- `400` - Missing passwords or incorrect current password
- `404` - User not found

---

## Admin

---

## Superadmin

### `GET /api/superadmin/dashboard`

**Purpose**: Get superadmin dashboard statistics

**Methods**: `GET`

**Authentication**: Required

**Role Required**: `SUPERADMIN`

**Query Params**: None

**Response** (200):
```json
{
  "stats": {
    "totalSchools": "number",
    "totalStudents": "number",
    "totalTeachers": "number"
  },
  "schools": [
    {
      "id": "string",
      "name": "string",
      "location": "string",
      "studentCount": "number",
      "teacherCount": "number",
      "classCount": "number"
    }
  ],
  "feeTransactions": [
    {
      "id": "string",
      "slNo": "number",
      "amount": "number",
      "schoolId": "string",
      "schoolName": "string",
      "studentName": "string",
      "createdAt": "Date"
    }
  ]
}
```

---

### `GET /api/superadmin/schools`

**Purpose**: List all schools with admin info and statistics

**Methods**: `GET`

**Authentication**: Required

**Role Required**: `SUPERADMIN`

**Query Params**:
- `search` (optional) - Search by school name (case-insensitive)

**Response** (200):
```json
{
  "schools": [
    {
      "slNo": "number",
      "id": "string",
      "name": "string",
      "address": "string",
      "location": "string",
      "isActive": "boolean",
      "studentCount": "number",
      "teacherCount": "number",
      "classCount": "number",
      "turnover": "number",
      "admin": {
        "id": "string",
        "name": "string",
        "email": "string",
        "mobile": "string",
        "role": "string"
      } | null
    }
  ],
  "totalTransactionCount": "number",
  "totalAmount": "number"
}
```

---

### `POST /api/superadmin/schools/create`

**Purpose**: Create school and school admin user

**Methods**: `POST`

**Authentication**: Required

**Role Required**: `SUPERADMIN`

**Request Body**:
```json
{
  "schoolName": "string",
  "email": "string",
  "password": "string",
  "address": "string",
  "location": "string",
  "phone": "string"
}
```

**Response** (201):
```json
{
  "message": "School and admin created",
  "user": { "id": "string", "name": "string", "email": "string", "role": "string" },
  "school": { "id": "string", "name": "string", "address": "string", "location": "string" }
}
```

**Error Cases**:
- `400` - Missing required fields, invalid email, or email already exists

**Notes**: Creates school + admin in a transaction and links `user.schoolId`

---

### `PATCH /api/superadmin/schools/:id/active`

**Purpose**: Set school active/inactive status

**Methods**: `PATCH`

**Authentication**: Required

**Role Required**: `SUPERADMIN`

**Path Params**:
- `id` - School ID

**Request Body**:
```json
{ "isActive": "boolean" }
```

**Response** (200):
```json
{
  "school": {
    "id": "string",
    "name": "string",
    "isActive": "boolean"
  }
}
```

**Notes**: When inactive, the school is paused (UI should treat as blocked)

---

## School

### `POST /api/school/create`

**Purpose**: Create a school (for school admin)

**Methods**: `POST`

**Authentication**: Required; role `SCHOOLADMIN` or `SUPERADMIN` (others get 403)

**Request Body**:
```json
{ "name": "string", "address": "string", "location": "string" }
```

**Response** (201):
```json
{ "message": "School created successfully", "school": {} }
```

---

### `GET /api/school/mine`

**Purpose**: Get current user's school details

**Methods**: `GET`

**Authentication**: Required

**Response** (200):
```json
{ "school": {} | null }
```

**Notes**: Blocks when `schoolIsActive === false`

---

### `PUT /api/school/update`

**Purpose**: Update school details

**Methods**: `PUT`

**Authentication**: Required

**Request Body**:
```json
{ "name": "string", "address": "string", "location": "string" }
```

**Response** (200):
```json
{ "message": "School updated", "updated": {} }
```

---

### `GET /api/school/settings`

**Purpose**: Get school settings (admission prefix, roll prefix, counter)

**Methods**: `GET`

**Authentication**: Required

**Response** (200):
```json
{ "settings": { "schoolId": "string", "admissionPrefix": "string", "rollNoPrefix": "string", "admissionCounter": "number" } }
```

**Notes**: Creates default settings if not found

---

### `PUT /api/school/settings`

**Purpose**: Update school settings

**Methods**: `PUT`

**Authentication**: Required

**Request Body**:
```json
{ "admissionPrefix": "string", "rollNoPrefix": "string" }
```

**Response** (200): Same as GET

---

## Class

### `POST /api/class/create`

**Purpose**: Create a new class

**Methods**: `POST`

**Authentication**: Required

**Request Body**:
```json
{ "name": "string", "section": "string | null", "teacherId": "string | null" }
```

---

### `GET /api/class/list`

**Purpose**: List classes for current school

**Methods**: `GET`

**Authentication**: Required


---

### `GET /api/class/:id`

**Purpose**: Get class details with students

**Methods**: `GET`

**Authentication**: Required

---

### `PUT /api/class/:id`

**Purpose**: Update class details

**Methods**: `PUT`

**Authentication**: Required

---

### `DELETE /api/class/:id`

**Purpose**: Delete class (only if it has no students)

**Methods**: `DELETE`

**Authentication**: Required

---

### `GET /api/class/students`

**Purpose**: List students in a class (or all students if no `classId`)

**Methods**: `GET`

**Authentication**: Required

**Query Params**:
- `classId` (optional)

---

## Student

### `POST /api/student/create`

**Purpose**: Create a student + user account + fee record

**Methods**: `POST`

**Authentication**: Required

**Notes**: Admission number auto-generated from school settings; password derived from DOB (YYYYMMDD)

---

### `GET /api/student/list`

**Purpose**: List students in the school

**Methods**: `GET`

**Authentication**: Required

**Query Params**:
- `rollNo` (optional)
- `admissionNumber` (optional)

---

### `PUT /api/student/assign-class`

**Purpose**: Assign/remove student to/from a class

**Methods**: `PUT`

**Authentication**: Required

---

### `POST /api/student/bulk-upload`

**Purpose**: Bulk upload students from Excel

**Methods**: `POST`

**Authentication**: Required

**Body**: `multipart/form-data` with `file`

---

## Teacher

### `POST /api/teacher/create`

**Purpose**: Create teacher user in the current school

**Methods**: `POST`

**Authentication**: Required

---

### `GET /api/teacher/list`

**Purpose**: List teachers in the current school

**Methods**: `GET`

**Authentication**: Required


---

## Teacher Audit

### `GET /api/teacher-audit/teachers`

**Purpose**: List teachers + computed performance score

**Methods**: `GET`

**Authentication**: Required

**Role Required**: `SCHOOLADMIN`

**Query Params**:
- `q` (optional) - name/email/teacherId/subject search

---

### `GET /api/teacher-audit/:teacherId/records`

**Purpose**: Get audit records for a teacher

**Methods**: `GET`

**Authentication**: Required

**Role Required**: `SCHOOLADMIN`

**Query Params**:
- `take` (optional, max 100)

---

### `POST /api/teacher-audit/:teacherId/records`

**Purpose**: Create audit record for a teacher

**Methods**: `POST`

**Authentication**: Required

**Role Required**: `SCHOOLADMIN`

---

## Leaves (Teacher Leaves)

### `POST /api/leaves/apply`
**Purpose**: Teacher applies for leave

### `GET /api/leaves/my`
**Purpose**: Current teacher’s leaves

### `GET /api/leaves/pending`
**Purpose**: Pending leaves for school

### `GET /api/leaves/all`
**Purpose**: All leaves for school

### `PATCH /api/leaves/:id/approve`
**Purpose**: Approve leave

### `PATCH /api/leaves/:id/reject`
**Purpose**: Reject leave

---

## Student Leaves

### `POST /api/student-leaves/apply`
**Purpose**: Student applies for leave

### `GET /api/student-leaves/my`
**Purpose**: Current student’s leave requests

### `GET /api/student-leaves/pending`
**Purpose**: Pending student leaves (teacher/admin)

### `GET /api/student-leaves/all`
**Purpose**: All student leave requests for school (teacher/admin)

### `PATCH /api/student-leaves/:id/approve`
**Purpose**: Approve student leave (teacher/admin)

### `PATCH /api/student-leaves/:id/reject`
**Purpose**: Reject student leave (teacher/admin)

---

## Transfer Certificate (TC)

### `POST /api/tc/apply`
**Purpose**: Student requests TC

### `GET /api/tc/list`
**Purpose**: List TC requests (students see their own)

### `POST /api/tc/:id/approve`
**Purpose**: Approve TC (also deactivates student user, logs history)

### `POST /api/tc/:id/reject`
**Purpose**: Reject TC

---

## Exams

### `GET /api/exams/terms`
**Purpose**: List exam terms (school admin)

### `POST /api/exams/terms`
**Purpose**: Create exam term (school admin)

### `GET /api/exams/terms/:id`
**Purpose**: Term detail (includes schedule + syllabus + syllabus units)

### `PUT /api/exams/terms/:id`
**Purpose**: Update exam term

### `GET /api/exams/terms/:id/schedule`
**Purpose**: List schedules for term

### `POST /api/exams/terms/:id/schedule`
**Purpose**: Add schedule item

### `GET /api/exams/terms/:id/syllabus`
**Purpose**: List subjects for term

### `POST /api/exams/terms/:id/syllabus`
**Purpose**: Add/update subject tracking row

### `POST /api/exams/terms/:id/syllabus/units`
**Purpose**: Add unit to a subject

### `PATCH /api/exams/units/:id`
**Purpose**: Update unit completion % (teacher/admin)

---

## Attendance

### `POST /api/attendance/mark`
**Purpose**: Mark attendance (teacher)

### `GET /api/attendance/view`
**Purpose**: View attendance (students see own; teacher/admin can filter)

---

## Marks

### `POST /api/marks/create`
**Purpose**: Create mark record

### `GET /api/marks/view`
**Purpose**: View marks (students see own)

### `PUT /api/marks/:id`
**Purpose**: Update marks (only the teacher who created it)

### `DELETE /api/marks/:id`
**Purpose**: Delete marks (only the teacher who created it)

### `GET /api/marks/download`
**Purpose**: Download marks report data (JSON or PDF-data)

---

## Homework

### `POST /api/homework/create`
**Purpose**: Create homework (teacher)

### `GET /api/homework/list`
**Purpose**: List homework (students see their class)

### `POST /api/homework/submit`
**Purpose**: Submit homework (student)

---

## Events

### `POST /api/events/create`
**Purpose**: Create event (teacher/admin)

### `GET /api/events/list`
**Purpose**: List events (students see class + school-wide)

### `POST /api/events/register`
**Purpose**: Student registers for event

---

## Fees

### `GET /api/fees/mine`
**Purpose**: Student fee details

### `GET /api/fees/student/:id`
**Purpose**: Admin fetch fee details by studentId

### `PATCH /api/fees/student/:id`
**Purpose**: Admin update fee plan fields

### `GET /api/fees/summary`
**Purpose**: Admin fee dashboard summary

---

## Payment

### `POST /api/payment/create-order`
**Purpose**: Create HyperPG payment session; returns `payment_url` for redirect.

### `POST /api/payment/verify`
**Purpose**: Verify HyperPG order status (Order Status API) + create payment + update fees

---

## Newsfeed

### `GET /api/newsfeed/list`

**Purpose**: List news feed posts for the current user's school

**Methods**: `GET`

**Authentication**: Required

**Query Params**: None

**Response** (200):
```json
{
  "newsFeeds": [
    {
      "id": "string",
      "title": "string",
      "description": "string",
      "photo": "string | null",
      "mediaUrl": "string | null",
      "mediaType": "PHOTO | null",
      "likes": 0,
      "schoolId": "string",
      "createdById": "string",
      "createdBy": {
        "id": "string",
        "name": "string | null",
        "email": "string | null"
      },
      "createdAt": "ISO8601",
      "updatedAt": "ISO8601",
      "likedByMe": false
    }
  ]
}
```

**Notes**: Returns empty array if user has no schoolId. Ordered by `createdAt` DESC.

---

### `POST /api/newsfeed/create`

**Purpose**: Create a new news feed post

**Methods**: `POST`

**Authentication**: Required

**Request Body**:
```json
{
  "title": "string",
  "description": "string",
  "photo": "string | null",
  "mediaUrl": "string | null"
}
```
`title` and `description` are required. `photo` or `mediaUrl` optional.

**Response** (201):
```json
{
  "message": "News feed created successfully",
  "newsFeed": {
    "id": "string",
    "title": "string",
    "description": "string",
    "photo": "string | null",
    "likes": 0,
    "createdBy": { "id": "string", "name": "string | null", "email": "string | null" },
    "createdAt": "ISO8601",
    "updatedAt": "ISO8601",
    "likedByMe": false
  }
}
```

**Error Cases**:
- `400` - Title and description required; School not found (user has no schoolId)

---

### `PUT /api/newsfeed/:id`

**Purpose**: Update a news feed post

**Methods**: `PUT`

**Authentication**: Required

**Path Params**: `id` - News feed ID

**Request Body**:
```json
{
  "title": "string",
  "description": "string",
  "photo": "string | null",
  "mediaUrl": "string | null"
}
```
All fields optional; only provided fields are updated.

**Response** (200):
```json
{
  "message": "News feed updated successfully",
  "newsFeed": { ... }
}
```

**Error Cases**:
- `400` - School not found in session
- `404` - News feed not found or doesn't belong to your school

---

### `DELETE /api/newsfeed/:id`

**Purpose**: Delete a news feed post

**Methods**: `DELETE`

**Authentication**: Required

**Path Params**: `id` - News feed ID

**Response** (200):
```json
{
  "message": "News feed deleted successfully"
}
```

**Error Cases**:
- `400` - School not found in session
- `404` - News feed not found or doesn't belong to your school

---

### `POST /api/newsfeed/:id/like`

**Purpose**: Toggle like on a news feed post (like if not liked, unlike if already liked)

**Methods**: `POST`

**Authentication**: Required

**Path Params**: `id` - News feed ID

**Request Body**: None

**Response** (200):
```json
{
  "liked": true,
  "likes": 5
}
```
When unliking: `liked: false`, `likes` is decremented.

**Error Cases**:
- `404` - News feed not found

---

## Notifications

### `GET /api/notifications`
**Purpose**: List notifications + unreadCount

### `POST /api/notifications`
**Purpose**: Create notification (system/admin use)

### `PATCH /api/notifications/:id/read`
**Purpose**: Mark one as read

### `PATCH /api/notifications/mark-all-read`
**Purpose**: Mark all as read

---

## Communication

### `GET /api/communication/appointments`
**Purpose**: List appointments (student/teacher)

### `POST /api/communication/appointments`
**Purpose**: Student creates appointment request

### `POST /api/communication/appointments/:id/approve`
**Purpose**: Teacher approves appointment

### `GET /api/communication/messages`
**Purpose**: List messages for appointment chat

### `POST /api/communication/messages`
**Purpose**: Send message in appointment chat

### `GET /api/communication/zegoToken`
**Purpose**: Deprecated (returns 410)

---

## Room Allocation

### `POST /api/room-allocation/create`
### `GET /api/room-allocation/list`
### `POST /api/room-allocation/assign-students`
### `POST /api/room-allocation/assign-teachers`
### `POST /api/room-allocation/auto-assign`
### `POST /api/room-allocation/pdf`

**Purpose**: Room/seat allocation tooling for exams (create, list, assign, auto-assign, PDF)

---

## Certificates

### `POST /api/certificates/template/create`
### `GET /api/certificates/template/list`
### `GET /api/certificates/list`
### `POST /api/certificates/assign`

**Purpose**: Certificate templates and certificate issuance

---

## Circular

### `POST /api/circular/create`
### `GET /api/circular/list`

**Purpose**: Circular / notice creation and listing

---

## History

### `GET /api/history/student`

**Purpose**: Student history records (deactivated students / TC history)

---

## Appendix: Complete Route List (86)

1. `app/api/attendance/mark/route.ts`
2. `app/api/attendance/view/route.ts`
3. `app/api/auth/[...nextauth]/route.ts`
5. `app/api/certificates/assign/route.ts`
6. `app/api/certificates/list/route.ts`
7. `app/api/certificates/template/create/route.ts`
8. `app/api/certificates/template/list/route.ts`
9. `app/api/class/[id]/route.ts`
10. `app/api/class/create/route.ts`
11. `app/api/class/list/route.ts`
12. `app/api/class/students/route.ts`
13. `app/api/circular/create/route.ts`
14. `app/api/circular/list/route.ts`
15. `app/api/communication/appointments/[id]/approve/route.ts`
16. `app/api/communication/appointments/route.ts`
17. `app/api/communication/messages/route.ts`
18. `app/api/communication/zegoToken/route.ts`
19. `app/api/events/create/route.ts`
20. `app/api/events/list/route.ts`
21. `app/api/events/register/route.ts`
22. `app/api/exams/terms/[id]/route.ts`
23. `app/api/exams/terms/[id]/schedule/route.ts`
24. `app/api/exams/terms/[id]/syllabus/route.ts`
25. `app/api/exams/terms/[id]/syllabus/units/route.ts`
26. `app/api/exams/terms/route.ts`
27. `app/api/exams/units/[id]/route.ts`
28. `app/api/fees/mine/route.ts`
29. `app/api/fees/student/[id]/route.ts`
30. `app/api/fees/summary/route.ts`
31. `app/api/history/student/route.ts`
32. `app/api/homework/create/route.ts`
33. `app/api/homework/list/route.ts`
34. `app/api/homework/submit/route.ts`
35. `app/api/leaves/[id]/approve/route.ts`
36. `app/api/leaves/[id]/reject/route.ts`
37. `app/api/leaves/all/route.ts`
38. `app/api/leaves/apply/route.ts`
39. `app/api/leaves/my/route.ts`
40. `app/api/leaves/pending/route.ts`
41. `app/api/marks/[id]/route.ts`
42. `app/api/marks/create/route.ts`
43. `app/api/marks/download/route.ts`
44. `app/api/marks/view/route.ts`
45. `app/api/newsfeed/[id]/like/route.ts`
46. `app/api/newsfeed/[id]/route.ts`
47. `app/api/newsfeed/create/route.ts`
48. `app/api/newsfeed/list/route.ts`
49. `app/api/notifications/[id]/read/route.ts`
50. `app/api/notifications/mark-all-read/route.ts`
51. `app/api/notifications/route.ts`
52. `app/api/payment/create-order/route.ts`
53. `app/api/payment/verify/route.ts`
54. `app/api/room-allocation/assign-students/route.ts`
55. `app/api/room-allocation/assign-teachers/route.ts`
56. `app/api/room-allocation/auto-assign/route.ts`
57. `app/api/room-allocation/create/route.ts`
58. `app/api/room-allocation/list/route.ts`
59. `app/api/room-allocation/pdf/route.ts`
60. `app/api/school/create/route.ts`
61. `app/api/school/mine/route.ts`
62. `app/api/school/settings/route.ts`
63. `app/api/school/update/route.ts`
64. `app/api/student/assign-class/route.ts`
65. `app/api/student/bulk-upload/route.ts`
66. `app/api/student/create/route.ts`
67. `app/api/student/list/route.ts`
68. `app/api/student-leaves/[id]/approve/route.ts`
69. `app/api/student-leaves/[id]/reject/route.ts`
70. `app/api/student-leaves/all/route.ts`
71. `app/api/student-leaves/apply/route.ts`
72. `app/api/student-leaves/my/route.ts`
73. `app/api/student-leaves/pending/route.ts`
74. `app/api/superadmin/dashboard/route.ts`
75. `app/api/superadmin/schools/[id]/active/route.ts`
76. `app/api/superadmin/schools/create/route.ts`
77. `app/api/superadmin/schools/route.ts`
78. `app/api/tc/[id]/approve/route.ts`
79. `app/api/tc/[id]/reject/route.ts`
80. `app/api/tc/apply/route.ts`
81. `app/api/tc/list/route.ts`
82. `app/api/teacher-audit/[teacherId]/records/route.ts`
83. `app/api/teacher-audit/teachers/route.ts`
84. `app/api/teacher/create/route.ts`
85. `app/api/teacher/list/route.ts`
85. `app/api/user/change-password/route.ts`
86. `app/api/user/me/route.ts`

