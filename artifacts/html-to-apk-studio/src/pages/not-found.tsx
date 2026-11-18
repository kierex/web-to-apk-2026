import { Link } from 'wouter';
import { AlertCircle, Home } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md mx-4">
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <div className="flex mb-4 gap-3">
            <AlertCircle className="h-9 w-9 text-red-500" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">404</h1>
              <p className="text-sm text-gray-600">This page doesn&apos;t exist.</p>
            </div>
          </div>
          <Link
            href="/"
            className="mt-4 inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Home className="h-4 w-4" /> Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
