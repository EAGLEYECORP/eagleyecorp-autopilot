import '../autopilot.css';
import LoginForm from '@/components/autopilot/LoginForm';

export const metadata = {
  title: 'Connexion — EAGLEYE Autopilot',
};

export default async function AutopilotLoginPage({ searchParams }) {
  const params = await searchParams;
  const next = typeof params?.next === 'string' ? params.next : '/autopilot';
  return <LoginForm next={next} />;
}
