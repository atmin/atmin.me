import { useState } from 'react';
import Head from 'next/head';
import Image from 'next/image';
import Link from 'next/link';

export default function Home() {
  const [emailRevealed, setEmailRevealed] = useState(false);
  const [email, setEmail] = useState(
    `${
      typeof window === 'object' &&
      window.matchMedia('(pointer: coarse)').matches
        ? 'tap'
        : 'click'
    } to reveal e-mail`
  );
  return (
    <>
      <Head>
        <title>atmin</title>
        <meta name="description" content="Atanas Minev" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <main>
        <div style={{ padding: '1em', display: 'flex', alignItems: 'center' }}>
          <Image src="/atmin-qr.png" alt="atmin qr" width={96} height={96} />
          <div
            style={{
              marginLeft: '1em',
              height: '96px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div>
              Atanas Minev{' '}
              <span
                style={{
                  fontSize: emailRevealed ? '0.9em' : '0.8em',
                  cursor: emailRevealed ? 'default' : 'help',
                  userSelect: 'none',
                }}
                onClick={
                  emailRevealed
                    ? () => {}
                    : () => {
                        setEmailRevealed(true);
                        setEmail(atob('YXRtaW5AcG0ubWU='));
                      }
                }
              >
                <span style={{ opacity: 0.2 }}>&lsaquo;</span>{email}
                <span style={{ opacity: 0.2 }}>&rsaquo;</span>
              </span>
            </div>
            <Link href="https://github.com/atmin">github.com/atmin</Link>
            <Link href="https://www.linkedin.com/in/atmin">
              linkedin.com/in/atmin
            </Link>
            <Link href="/panoramas">…</Link>
          </div>
        </div>
      </main>
    </>
  );
}
