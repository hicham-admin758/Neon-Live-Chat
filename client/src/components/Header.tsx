import { useState } from "react";
import { Menu, X } from "lucide-react";

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const toggleMenu = () => setIsMenuOpen(!isMenuOpen);

  return (
    <header className="fixed w-full top-0 z-50 bg-glass border-b border-purple-500/30">
      <nav className="max-w-[1400px] mx-auto flex justify-between items-center px-8 py-0">
        <div className="text-[1.8rem] font-bold text-gradient-logo flex items-center gap-2.5 before:content-['🎮'] before:text-[2rem]">
          منصة الألعاب
        </div>

        {/* Desktop Navigation */}
        <ul className="hidden md:flex gap-8 list-none">
          <li><a href="#home" className="text-white font-medium px-4 py-2 rounded-lg transition-all hover:bg-purple-600/20 hover:text-cyan-400">الرئيسية</a></li>
          <li><a href="#game-circle" className="text-white font-medium px-4 py-2 rounded-lg transition-all hover:bg-purple-600/20 hover:text-cyan-400">ساحة اللعب</a></li>
          <li><a href="#games" className="text-white font-medium px-4 py-2 rounded-lg transition-all hover:bg-purple-600/20 hover:text-cyan-400">الألعاب</a></li>
          <li><a href="#features" className="text-white font-medium px-4 py-2 rounded-lg transition-all hover:bg-purple-600/20 hover:text-cyan-400">المميزات</a></li>
        </ul>

        <a href="#games" className="hidden md:inline-block btn-gradient text-white px-8 py-3 rounded-[25px] font-bold transition-all hover:-translate-y-0.5 hover:shadow-[0_10px_30px_rgba(138,43,226,0.4)]">
          ابدأ اللعب الآن
        </a>

        {/* Mobile Menu Button */}
        <button className="md:hidden text-white p-2" onClick={toggleMenu}>
          {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </nav>

      {/* Mobile Navigation */}
      {isMenuOpen && (
        <div className="md:hidden absolute top-full left-0 w-full bg-[#0a0e27] border-b border-purple-500/30 py-4 px-8 flex flex-col gap-4">
          <a href="#home" className="text-white hover:text-cyan-400" onClick={() => setIsMenuOpen(false)}>الرئيسية</a>
          <a href="#game-circle" className="text-white hover:text-cyan-400" onClick={() => setIsMenuOpen(false)}>ساحة اللعب</a>
          <a href="#games" className="text-white hover:text-cyan-400" onClick={() => setIsMenuOpen(false)}>الألعاب</a>
          <a href="#features" className="text-white hover:text-cyan-400" onClick={() => setIsMenuOpen(false)}>المميزات</a>
          <a href="#games" className="btn-gradient text-center text-white px-6 py-2 rounded-[25px] font-bold" onClick={() => setIsMenuOpen(false)}>
            ابدأ اللعب الآن
          </a>
        </div>
      )}
    </header>
  );
}
