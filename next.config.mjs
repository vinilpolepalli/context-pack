/** @type {import('next').NextConfig} */
// Server runtime (no static export). Native/DB drivers stay external to the bundle.
export default { serverExternalPackages: ["better-sqlite3", "postgres"] };
