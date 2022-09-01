import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import profilePic from "../public/atmin160.jpg";

export default function Home() {
  return (
    <div style={{ padding: "0 2rem" }}>
      <Head>
        <title>atmin</title>
        <meta name="description" content="Atanas Minev publishes interactive panoramas" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main>
        <h1>
          <span
            style={{
              verticalAlign: "middle",
              marginRight: "0.2em",
            }}
          >
            <Image
              src={profilePic}
              alt="Atanas Minev seen from a drone"
              width={160}
              height={160}
              placeholder="blur"
              style={{
                borderRadius: "50%",
              }}
            />
          </span>
          <span style={{ display: "inline-block" }}>Atanas Minev</span>
        </h1>

        <p style={{ fontStyle: "italic" }}>presents</p>

        <div>
          <Link href="/pano/denis">
            <section className="content-item">
              <picture>
                <img
                  src="/pano/denis/thumbnail.jpg"
                  alt="Paralia Katerini, Greece. Above Denis hotel."
                />
              </picture>
              <p>Paralia Katerini, Greece. Above Denis hotel.</p>
            </section>
          </Link>
        </div>
      </main>

      <footer>
        <a href="https://github.com/atmin/atmin.me">Site source on Github</a>
        &copy; 2022 Atanas Minev
      </footer>
    </div>
  );
}
