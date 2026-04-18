import { Users, Mail, Phone, MapPin, Bookmark } from "lucide-react";

interface StudentProfileProps {
  name: string;
  id: string;
  className: string;
  rollNo: string;
  age: string;
  email: string;
  phone: string;
  address: string;
  photoUrl?: string | null;
}

type Props = {
  student: StudentProfileProps;
  fatherName?: string;
  fatherOccupation?: string;
  fatherPhone?: string;
  motherName?: string;
  motherOccupation?: string;
};

export const ProfileSidebar = ({
  student,
  fatherName = "",
  fatherOccupation = "",
  fatherPhone = "",
  motherName = "",
  motherOccupation = "",
}: Props) => (
  <div className="space-y-4 sm:space-y-6 min-w-0">
    {/* Student Identity Card */}
    <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl sm:rounded-[2rem] p-4 sm:p-5 text-center shadow-xl">
      <div className="relative w-24 h-24 sm:w-32 sm:h-32 mx-auto mb-4 sm:mb-6">
        <img
          src={student.photoUrl || "/avatar.jpg"}
          className="rounded-[2rem] border-2 border-[#b4f44d] object-cover w-full h-full shadow-lg"
          alt={student.name}
        />
        <span className="absolute -bottom-2 -right-2 bg-[#b4f44d] text-[#2d243a] p-2 rounded-xl shadow-md">
          <Bookmark size={16} fill="currentColor" />
        </span>
      </div>
      
      <h3 className="text-xl sm:text-2xl font-bold text-white mb-1 break-words px-1">{student.name}</h3>
      <p className="text-[#b4f44d] text-xs sm:text-sm font-mono tracking-widest mb-6 sm:mb-8 uppercase opacity-80 break-all px-1">
        {student.id}
      </p>

      <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-6 sm:mb-8">
        <div className="bg-white/5 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl border border-white/5 min-w-0 px-1">
          <p className="text-[9px] sm:text-[10px] text-gray-400 font-bold uppercase tracking-tighter">Class</p>
          <p
            className="text-xs sm:text-sm font-bold text-white break-words whitespace-normal leading-snug"
            title={student.className}
          >
            {student.className}
          </p>
        </div>
        <div className="bg-white/5 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl border border-white/5 min-w-0 px-1">
          <p className="text-[9px] sm:text-[10px] text-gray-400 font-bold uppercase tracking-tighter">Roll No</p>
          <p className="text-xs sm:text-sm font-bold text-white truncate">{student.rollNo}</p>
        </div>
        <div className="bg-white/5 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl border border-white/5 min-w-0 px-1">
          <p className="text-[9px] sm:text-[10px] text-gray-400 font-bold uppercase tracking-tighter">Age</p>
          <p className="text-xs sm:text-sm font-bold text-white">{student.age}</p>
        </div>
      </div>

      <div className="text-left space-y-3 pt-4 sm:pt-6 border-t border-white/5">
        <div className="flex items-start gap-3 text-gray-300 min-w-0">
          <div className="rounded-lg flex-shrink-0 mt-0.5">
            <Mail size={16} className="text-[#b4f44d]" />
          </div>
          <span className="text-xs sm:text-sm break-all min-w-0">{student.email}</span>
        </div>
        <div className="flex items-start gap-3 text-gray-300 min-w-0">
          <div className="rounded-lg flex-shrink-0 mt-0.5">
            <Phone size={16} className="text-[#b4f44d]" />
          </div>
          <span className="text-xs sm:text-sm break-all">{student.phone}</span>
        </div>
        <div className="flex items-start gap-3 text-gray-300 min-w-0">
          <div className="rounded-lg flex-shrink-0 mt-0.5">
            <MapPin size={16} className="text-[#b4f44d]" />
          </div>
          <span className="text-xs sm:text-sm leading-snug break-words">{student.address}</span>
        </div>
      </div>
    </div>

    {/* Parent Details Card */}
    <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl sm:rounded-[2rem] p-4 shadow-xl min-w-0">
      <h4 className="text-[#b4f44d] font-bold mb-4 sm:mb-6 flex items-center gap-2 sm:gap-3 text-base sm:text-lg">
        <Users className="w-6 h-6" /> Parents Details
      </h4>
      
      <div className="space-y-6">
        {/* Father Info */}
        <div className="space-y-3">
          <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest ml-1">Father / Guardian</label>
          <div className="grid grid-cols-1 gap-2">
            <div className="bg-white/5 py-2 px-2 rounded-2xl border border-white/5">
              <p className="text-[10px] text-gray-500 font-bold uppercase">Name</p>
              <p className="text-xs font-bold text-white">{fatherName || "Not Provided"}</p>
            </div>
            <div className="bg-white/5 py-2 px-2 rounded-2xl border border-white/5">
              <p className="text-[10px] text-gray-500 font-bold uppercase">Occupation</p>
              <p className="text-xs font-bold text-white">{fatherOccupation || "-"}</p>
            </div>
          </div>
        </div>

        {/* Mother Info */}
        <div className="space-y-3">
          <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest ml-1">Mother</label>
          <div className="grid grid-cols-1 gap-2">
            <div className="bg-white/5 py-2 px-2 rounded-2xl border border-white/5">
              <p className="text-[10px] text-gray-500 font-bold uppercase">Name</p>
              <p className="text-xs font-bold text-white">{motherName || "Not Provided"}</p>
            </div>
            <div className="bg-white/5 py-2 px-2 rounded-2xl border border-white/5">
              <p className="text-[10px] text-gray-500 font-bold uppercase">Occupation</p>
              <p className="text-xs font-bold text-white">{motherOccupation || "-"}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
);