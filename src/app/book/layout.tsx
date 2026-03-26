import Image from "next/image";

export default function BookLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-jai-bg">
      <header className="border-b border-jai-border bg-jai-card">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <Image src="/logo.jpg" alt="JAI Muay Thai" width={36} height={36} className="rounded-full" />
          <h1 className="text-base font-bold">
            JAI <span className="text-jai-blue">MUAY THAI</span>
          </h1>
        </div>
      </header>
      <main className="max-w-lg mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
