import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import profilePic from "../public/atmin160.jpg";

export default function Home() {
  return (
    <div style={{ padding: "0 2rem" }}>
      <Head>
        <title>atmin</title>
        <meta
          name="description"
          content="Atanas Minev publishes interactive panoramas"
        />
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

        <p></p>
        <p></p>

        {/* <p style={{ fontStyle: "italic" }}>presents (very, VERY work in progress)</p> */}

        <div>
          <Link href="/pano/2022-07-06-paralia-katerini">
            <section className="content-item">
              <picture>
                <img
                  src="/pano/2022-07-06-paralia-katerini/thumbnail.jpg"
                  alt="Denis hotel. Paralia Katerini, Greece"
                />
              </picture>
              <p>Denis hotel. Paralia Katerini, Greece</p>
            </section>
          </Link>
          <Link href="/pano/2022-08-28-hotel-rodina">
            <section className="content-item">
              <picture>
                <img
                  src="/pano/2022-08-28-hotel-rodina/thumbnail.jpg"
                  alt="Hotel Rodina. Sofia, Bulgaria"
                />
              </picture>
              <p>Hotel Rodina. Sofia, Bulgaria</p>
            </section>
          </Link>
          <Link href="/pano/2022-08-31-south-park">
            <section className="content-item">
              <picture>
                <img
                  src="/pano/2022-08-31-south-park/thumbnail.jpg"
                  alt="South Park. Sofia, Bulgaria"
                />
              </picture>
              <p>South Park. Sofia, Bulgaria</p>
            </section>
          </Link>
          <Link href="/pano/2022-09-07-serdika-1">
            <section className="content-item">
              <picture>
                <img
                  src="/pano/2022-09-07-serdika-1/thumbnail.jpg"
                  alt="Serdika District. Sofia, Bulgaria"
                />
              </picture>
              <p>Serdika District. Sofia, Bulgaria</p>
            </section>
          </Link>
          <Link href="/pano/2022-09-07-serdika-2">
            <section className="content-item">
              <picture>
                <img
                  src="/pano/2022-09-07-serdika-2/thumbnail.jpg"
                  alt="Serdika District. Sofia, Bulgaria"
                />
              </picture>
              <p>Serdika District. Sofia, Bulgaria</p>
            </section>
          </Link>{" "}
          <Link href="/pano/2022-09-07-serdika-3">
            <section className="content-item">
              <picture>
                <img
                  src="/pano/2022-09-07-serdika-3/thumbnail.jpg"
                  alt="Serdika District. Sofia, Bulgaria"
                />
              </picture>
              <p>Serdika District. Sofia, Bulgaria</p>
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
