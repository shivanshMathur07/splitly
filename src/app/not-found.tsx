import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto mt-16 max-w-md text-center">
      <p className="text-5xl">🧭</p>
      <h1 className="h1 mt-4">Not found</h1>
      <p className="muted mt-2">That page doesn&apos;t exist or you don&apos;t have access to it.</p>
      <Link href="/" className="btn mt-6">Back to dashboard</Link>
    </div>
  );
}
