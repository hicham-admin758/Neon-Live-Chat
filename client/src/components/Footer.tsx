import { Facebook, Twitter, Instagram, Youtube, MessageCircle } from "lucide-react";

export function Footer() {
  return (
    <footer className="bg-glass pt-12 pb-4 px-8 text-center border-t-2 border-purple-500/30 mt-auto">
      <div className="max-w-[1200px] mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 text-right mb-8">
        <div className="flex flex-col gap-2">
          <h3 className="text-cyan-400 mb-4 font-bold text-lg">عن المنصة</h3>
          <ul className="space-y-2">
            <li><a href="#" className="text-[#b8b8ff] hover:text-cyan-400 transition-colors">من نحن</a></li>
            <li><a href="#" className="text-[#b8b8ff] hover:text-cyan-400 transition-colors">فريق العمل</a></li>
            <li><a href="#" className="text-[#b8b8ff] hover:text-cyan-400 transition-colors">الوظائف</a></li>
            <li><a href="#" className="text-[#b8b8ff] hover:text-cyan-400 transition-colors">الصحافة</a></li>
          </ul>
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-cyan-400 mb-4 font-bold text-lg">الدعم</h3>
          <ul className="space-y-2">
            <li><a href="#" className="text-[#b8b8ff] hover:text-cyan-400 transition-colors">مركز المساعدة</a></li>
            <li><a href="#" className="text-[#b8b8ff] hover:text-cyan-400 transition-colors">الأسئلة الشائعة</a></li>
            <li><a href="#" className="text-[#b8b8ff] hover:text-cyan-400 transition-colors">اتصل بنا</a></li>
            <li><a href="#" className="text-[#b8b8ff] hover:text-cyan-400 transition-colors">الإبلاغ عن مشكلة</a></li>
          </ul>
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-cyan-400 mb-4 font-bold text-lg">قانوني</h3>
          <ul className="space-y-2">
            <li><a href="#" className="text-[#b8b8ff] hover:text-cyan-400 transition-colors">سياسة الخصوصية</a></li>
            <li><a href="#" className="text-[#b8b8ff] hover:text-cyan-400 transition-colors">الشروط والأحكام</a></li>
            <li><a href="#" className="text-[#b8b8ff] hover:text-cyan-400 transition-colors">سياسة الكوكيز</a></li>
            <li><a href="#" className="text-[#b8b8ff] hover:text-cyan-400 transition-colors">الترخيص</a></li>
          </ul>
        </div>

        <div className="flex flex-col gap-2 items-center sm:items-end">
          <h3 className="text-cyan-400 mb-4 font-bold text-lg">تابعنا</h3>
          <div className="flex gap-4 justify-center sm:justify-end mt-4">
            <a href="#" className="w-10 h-10 bg-purple-600/30 rounded-full flex items-center justify-center transition-all hover:bg-[#8a2be2] hover:-translate-y-1 text-white">
              <Facebook size={20} />
            </a>
            <a href="#" className="w-10 h-10 bg-purple-600/30 rounded-full flex items-center justify-center transition-all hover:bg-[#8a2be2] hover:-translate-y-1 text-white">
              <Twitter size={20} />
            </a>
            <a href="#" className="w-10 h-10 bg-purple-600/30 rounded-full flex items-center justify-center transition-all hover:bg-[#8a2be2] hover:-translate-y-1 text-white">
              <Instagram size={20} />
            </a>
            <a href="#" className="w-10 h-10 bg-purple-600/30 rounded-full flex items-center justify-center transition-all hover:bg-[#8a2be2] hover:-translate-y-1 text-white">
              <Youtube size={20} />
            </a>
            <a href="#" className="w-10 h-10 bg-purple-600/30 rounded-full flex items-center justify-center transition-all hover:bg-[#8a2be2] hover:-translate-y-1 text-white">
              <MessageCircle size={20} />
            </a>
          </div>
        </div>
      </div>

      <div className="pt-8 border-t border-purple-500/30 text-[#b8b8ff]">
        <p>&copy; 2025 منصة ألعاب التفاعل المباشر. جميع الحقوق محفوظة.</p>
      </div>
    </footer>
  );
}
