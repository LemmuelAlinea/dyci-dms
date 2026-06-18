import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useScroll, useTransform } from 'framer-motion';
import {
  ArrowRight,
  CheckCircle2,
  FileCheck2,
  FolderTree,
  History,
  Lock,
  Mail,
  Megaphone,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { Logo } from '@/components/ui/Logo';
import { Reveal } from '@/components/motion/Reveal';

const FEATURES = [
  { icon: FolderTree, title: 'Drive & folders', desc: 'Nested folders, modern breadcrumbs, and drag-drop uploads for PDF, Word, and Excel files.' },
  { icon: FileCheck2, title: 'Approval workflow', desc: 'Request approval, review with threaded comments, then release official papers.' },
  { icon: History, title: 'Version history', desc: 'Every re-upload is versioned. Track changes and restore any previous version.' },
  { icon: Megaphone, title: 'Released papers', desc: 'A searchable, office-wide feed of approved documents with owner & approver.' },
  { icon: Mail, title: 'Send anywhere', desc: 'Share with office members or email real attachments to any address via Brevo.' },
  { icon: ShieldCheck, title: 'Top-notch security', desc: 'Row-level security, per-office isolation, and signed download links.' },
];

const STEPS = [
  { n: '01', title: 'Upload', desc: 'Drop documents into your drive and organize them in folders.', img: '/assets/icon-upload.png' },
  { n: '02', title: 'Request approval', desc: 'Send it to the assigned approver and discuss in comments.', img: '/assets/icon-approval-stamp.png' },
  { n: '03', title: 'Release', desc: 'Approved papers are published to the office-wide feed.', img: '/assets/icon-file-stack.png' },
];

const ROLES = [
  { role: 'System Admin', desc: 'Creates offices and assigns their admins. Monitors the whole platform.', color: 'from-navy-700 to-navy-500' },
  { role: 'Org Admin', desc: 'Runs one office: invites members, assigns roles, monitors storage & reports.', color: 'from-gold-500 to-gold-300' },
  { role: 'Co-Admin', desc: 'Helps manage the office and can invite members by email.', color: 'from-navy-600 to-indigo-400' },
  { role: 'Staff / Approver', desc: 'Members with their own drive; approvers decide on documents.', color: 'from-emerald-600 to-teal-400' },
];

function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <motion.header
      initial={{ y: -80 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.5 }}
      className={`fixed inset-x-0 top-0 z-50 transition-all ${
        scrolled ? 'border-b border-white/10 bg-navy-950/80 backdrop-blur-md' : ''
      }`}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Link to="/" className="flex items-center gap-2.5">
          <Logo size={38} />
          <div className="leading-tight text-white">
            <p className="font-display text-base font-extrabold">DYCI · DMS</p>
            <p className="text-[10px] text-navy-200">Document Management</p>
          </div>
        </Link>
        <nav className="hidden items-center gap-8 text-sm font-medium text-navy-100 md:flex">
          <a href="#features" className="transition hover:text-white">Features</a>
          <a href="#how" className="transition hover:text-white">How it works</a>
          <a href="#roles" className="transition hover:text-white">Roles</a>
        </nav>
        <div className="flex items-center gap-2">
          <Link to="/login" className="rounded-xl px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10">
            Sign in
          </Link>
          <Link to="/register" className="btn-gold !px-4 !py-2 text-sm">
            Get started
          </Link>
        </div>
      </div>
    </motion.header>
  );
}

export function LandingPage() {
  const { scrollY } = useScroll();
  const heroY = useTransform(scrollY, [0, 500], [0, 120]);

  return (
    <div className="min-h-screen bg-navy-950 text-white">
      <Navbar />

      {/* HERO */}
      <section className="relative overflow-hidden bg-hero-navy pb-24 pt-32">
        <div className="absolute inset-0 opacity-40 [background:radial-gradient(circle_at_15%_15%,#3e50c8_0,transparent_40%),radial-gradient(circle_at_85%_30%,#eab02e44_0,transparent_38%),radial-gradient(circle_at_50%_90%,#2a3a9e_0,transparent_45%)]" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 lg:grid-cols-2">
          <div>
            <motion.span
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-gold-200"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-gold-400" /> Dr. Yanga's Colleges, Inc. · Bocaue, Bulacan
            </motion.span>
            <motion.h1
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="mt-5 font-display text-4xl font-extrabold leading-[1.05] sm:text-5xl lg:text-6xl"
            >
              Official documents,{' '}
              <span className="bg-gradient-to-r from-gold-300 to-gold-500 bg-clip-text text-transparent">
                approved & released
              </span>{' '}
              with confidence.
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="mt-5 max-w-lg text-lg text-navy-100"
            >
              A secure document management system for every office of DYCI — upload, version, approve, release, and
              share, all in one beautifully simple workspace.
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="mt-8 flex flex-wrap items-center gap-3"
            >
              <Link to="/register" className="btn-gold text-base">
                Get started <ArrowRight size={18} />
              </Link>
              <a href="#features" className="btn-outline border-white/20 !bg-transparent text-base text-white hover:bg-white/10">
                Explore features
              </a>
            </motion.div>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-navy-200"
            >
              {['Google sign-in', 'Email confirmation', 'Role-based access'].map((t) => (
                <span key={t} className="flex items-center gap-1.5">
                  <CheckCircle2 size={15} className="text-gold-300" /> {t}
                </span>
              ))}
            </motion.div>
          </div>

          <motion.div style={{ y: heroY }} className="relative hidden lg:block">
            <motion.div
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.7 }}
              className="relative mx-auto h-[420px] w-[420px]"
            >
              <div className="absolute inset-0 rounded-[2.5rem] border border-white/10 bg-white/5 backdrop-blur-sm" />
              <img src="/assets/icon-folder-gold.png" className="absolute -left-6 top-10 h-32 w-32 animate-float object-contain drop-shadow-2xl" alt="" />
              <img src="/assets/icon-approval-stamp.png" className="absolute right-2 top-2 h-28 w-28 object-contain drop-shadow-2xl" style={{ animation: 'float 7s ease-in-out infinite' }} alt="" />
              <img src="/assets/icon-document.png" className="absolute bottom-8 left-16 h-32 w-32 object-contain drop-shadow-2xl" style={{ animation: 'float 5.5s ease-in-out infinite' }} alt="" />
              <img src="/assets/icon-file-stack.png" className="absolute bottom-2 right-8 h-24 w-24 animate-float object-contain drop-shadow-2xl" alt="" />
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="bg-surface-light-2 py-24 text-navy-900 dark:bg-surface-dark dark:text-white">
        <div className="mx-auto max-w-6xl px-5">
          <Reveal className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-bold uppercase tracking-wider text-gold-600">Everything an office needs</p>
            <h2 className="mt-2 font-display text-3xl font-extrabold sm:text-4xl">Built for real document workflows</h2>
            <p className="mt-3 text-slate-500">From draft to released — with approvals, versioning, and secure sharing in between.</p>
          </Reveal>
          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <Reveal key={f.title} delay={i}>
                <div className="card group h-full p-6 transition-transform hover:-translate-y-1 hover:shadow-navy">
                  <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-navy-700 text-gold-300 transition group-hover:bg-gold-sheen group-hover:text-navy-900">
                    <f.icon size={24} />
                  </div>
                  <h3 className="font-display text-lg font-bold">{f.title}</h3>
                  <p className="mt-1.5 text-sm text-slate-500">{f.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how" className="bg-white py-24 text-navy-900 dark:bg-surface-dark-2 dark:text-white">
        <div className="mx-auto max-w-6xl px-5">
          <Reveal className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-bold uppercase tracking-wider text-gold-600">How it works</p>
            <h2 className="mt-2 font-display text-3xl font-extrabold sm:text-4xl">Three steps, fully tracked</h2>
          </Reveal>
          <div className="mt-14 grid gap-8 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <Reveal key={s.n} delay={i}>
                <div className="relative text-center">
                  <img src={s.img} alt="" className="mx-auto h-28 w-28 animate-float object-contain" />
                  <div className="mt-4 font-display text-5xl font-extrabold text-navy-100 dark:text-white/10">{s.n}</div>
                  <h3 className="-mt-6 font-display text-xl font-bold">{s.title}</h3>
                  <p className="mx-auto mt-2 max-w-xs text-sm text-slate-500">{s.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ROLES */}
      <section id="roles" className="bg-surface-light-2 py-24 text-navy-900 dark:bg-surface-dark dark:text-white">
        <div className="mx-auto max-w-6xl px-5">
          <Reveal className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-bold uppercase tracking-wider text-gold-600">Organizations & roles</p>
            <h2 className="mt-2 font-display text-3xl font-extrabold sm:text-4xl">Each office, its own secure space</h2>
            <p className="mt-3 text-slate-500">Offices like SOA, CCS, and CBEA are isolated workspaces with clear roles.</p>
          </Reveal>
          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {ROLES.map((r, i) => (
              <Reveal key={r.role} delay={i}>
                <div className="card h-full overflow-hidden p-0">
                  <div className={`h-1.5 bg-gradient-to-r ${r.color}`} />
                  <div className="p-5">
                    <Users size={22} className="mb-3 text-navy-600 dark:text-gold-300" />
                    <h3 className="font-display text-lg font-bold">{r.role}</h3>
                    <p className="mt-1.5 text-sm text-slate-500">{r.desc}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-3">
            {[
              { icon: Search, label: 'Global search across files, folders & released papers' },
              { icon: Lock, label: 'Archive & Bin with recover and permanent delete' },
              { icon: ShieldCheck, label: 'Dark mode, notifications & profile controls' },
            ].map((x) => (
              <Reveal key={x.label}>
                <div className="flex items-center gap-3 rounded-2xl border border-slate-200/70 bg-white p-4 text-sm font-medium dark:border-white/10 dark:bg-surface-dark-2">
                  <x.icon size={20} className="shrink-0 text-gold-600" /> {x.label}
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative overflow-hidden bg-hero-navy py-24">
        <div className="absolute inset-0 opacity-40 [background:radial-gradient(circle_at_70%_20%,#eab02e44_0,transparent_40%)]" />
        <Reveal className="relative mx-auto max-w-3xl px-5 text-center">
          <h2 className="font-display text-3xl font-extrabold sm:text-4xl">Ready to organize your office?</h2>
          <p className="mx-auto mt-3 max-w-xl text-navy-100">
            Sign in with your DYCI email and start managing documents the modern way.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Link to="/register" className="btn-gold text-base">
              Create your account <ArrowRight size={18} />
            </Link>
            <Link to="/login" className="btn-outline border-white/20 !bg-transparent text-base text-white hover:bg-white/10">
              Sign in
            </Link>
          </div>
        </Reveal>
      </section>

      {/* FOOTER */}
      <footer className="bg-navy-950 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 sm:flex-row">
          <div className="flex items-center gap-2.5">
            <Logo size={32} />
            <span className="text-sm text-navy-200">DYCI Document Management System</span>
          </div>
          <p className="text-xs text-navy-400">© {new Date().getFullYear()} Dr. Yanga's Colleges, Inc. · Bocaue, Bulacan</p>
        </div>
      </footer>
    </div>
  );
}
