import { useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';

const GOOGLE_CLIENT_ID = '1040868381866-f57f7porkkpsnnl0oeaq634djh9bi9qj.apps.googleusercontent.com';

interface GoogleCredentialResponse {
  credential: string;
}

interface JwtPayload {
  email: string;
  name: string;
  picture?: string;
  hd?: string;
}

function parseJwt(token: string): JwtPayload {
  const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  const json = decodeURIComponent(
    atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')
  );
  return JSON.parse(json) as JwtPayload;
}

export default function LoginPage() {
  const { login } = useAuth();
  const btnRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function initGoogle() {
      const g = (window as unknown as { google?: { accounts?: { id?: {
        initialize: (cfg: object) => void;
        renderButton: (el: HTMLElement, cfg: object) => void;
      } } } }).google;
      if (!g?.accounts?.id) return;

      g.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (response: GoogleCredentialResponse) => {
          const payload = parseJwt(response.credential);

          const allowed = payload.email?.endsWith('@musinsa.com') || payload.email?.endsWith('@29cm.co.kr');
          if (!allowed) {
            alert('무신사(@musinsa.com) 또는 29CM(@29cm.co.kr) 계정으로만 접근 가능합니다.');
            return;
          }
          login({ email: payload.email, name: payload.name, picture: payload.picture });
        },
      });

      if (btnRef.current) {
        g.accounts.id.renderButton(btnRef.current, {
          theme: 'outline',
          size: 'large',
          width: 280,
          text: 'signin_with',
          locale: 'ko',
        });
      }
    }

    // GSI 스크립트가 이미 로드됐으면 바로 초기화, 아니면 로드 후
    if ((window as unknown as { google?: unknown }).google) {
      initGoogle();
    } else {
      const script = document.querySelector('script[src*="accounts.google.com/gsi/client"]');
      if (script) {
        script.addEventListener('load', initGoogle);
        return () => script.removeEventListener('load', initGoogle);
      }
    }
  }, [login]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-lg p-10 w-full max-w-sm text-center space-y-6">
        {/* 로고/타이틀 */}
        <div className="space-y-2">
          <div className="w-14 h-14 bg-indigo-500 rounded-2xl flex items-center justify-center mx-auto">
            <span className="text-white font-bold text-2xl">C</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900">CBD 리소스 관리</h1>
          <p className="text-sm text-gray-500">무신사 / 29CM 계정으로 로그인하세요</p>
        </div>

        {/* Google 로그인 버튼 (GSI 렌더링) */}
        <div className="flex justify-center">
          <div ref={btnRef} />
        </div>

        <p className="text-xs text-gray-400">
          @musinsa.com / @29cm.co.kr 계정만 접근 가능합니다
        </p>
      </div>
    </div>
  );
}
