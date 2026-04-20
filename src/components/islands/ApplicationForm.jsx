import { useState } from "react";

/**
 * ApplicationForm — React island. POSTs to /api/candidature.
 * Props:
 *   poste    : slug of the job post (or "spontanee")
 *   posteNom : label displayed in the form
 */
export default function ApplicationForm({ poste = "spontanee", posteNom = "Candidature spontanée" }) {
  const [status, setStatus] = useState("idle"); // idle | sending | sent | error
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus("sending");
    setErrorMsg("");

    const formData = new FormData(e.currentTarget);
    formData.set("poste", poste);

    try {
      const res = await fetch("/api/candidature", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Une erreur est survenue");
      }
      setStatus("sent");
      e.currentTarget.reset();
    } catch (err) {
      setStatus("error");
      setErrorMsg(err.message);
    }
  }

  if (status === "sent") {
    return (
      <div className="bg-vert/10 border border-vert/20 rounded-3xl p-8 text-center">
        <div className="w-14 h-14 mx-auto rounded-full bg-vert/15 text-vert flex items-center justify-center">
          <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h3 className="font-soft font-bold text-[22px] mt-4">Candidature envoyée !</h3>
        <p className="text-[14.5px] text-neutral-700 mt-2 max-w-md mx-auto">
          Merci — nous revenons vers vous sous 48h ouvrées. En attendant, n'hésitez pas à
          passer nous voir en magasin.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-3xl p-6 md:p-8 shadow-card space-y-5" noValidate>
      <div>
        <p className="eyebrow">{posteNom}</p>
        <h3 className="font-soft font-bold text-[22px] mt-2">Votre candidature</h3>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="prenom" className="block text-[13px] font-bold mb-1.5">Prénom *</label>
          <input id="prenom" name="prenom" type="text" required className="input" />
        </div>
        <div>
          <label htmlFor="nom" className="block text-[13px] font-bold mb-1.5">Nom *</label>
          <input id="nom" name="nom" type="text" required className="input" />
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="email" className="block text-[13px] font-bold mb-1.5">Email *</label>
          <input id="email" name="email" type="email" required className="input" />
        </div>
        <div>
          <label htmlFor="telephone" className="block text-[13px] font-bold mb-1.5">Téléphone *</label>
          <input id="telephone" name="telephone" type="tel" required pattern="[0-9 +().-]{10,}" className="input" />
        </div>
      </div>

      <div>
        <label htmlFor="magasin" className="block text-[13px] font-bold mb-1.5">Magasin préféré</label>
        <select id="magasin" name="magasin" className="input">
          <option value="tous">Les deux — peu importe</option>
          <option value="portet">Portet-sur-Garonne</option>
          <option value="toulouse-sud">Toulouse Sud — Cépière</option>
        </select>
      </div>

      <div>
        <label htmlFor="message" className="block text-[13px] font-bold mb-1.5">Votre message / motivations</label>
        <textarea
          id="message"
          name="message"
          rows={5}
          placeholder="Parlez-nous un peu de vous, de vos expériences, de vos disponibilités…"
          className="input resize-none"
        />
      </div>

      <div>
        <label htmlFor="cv" className="block text-[13px] font-bold mb-1.5">CV (PDF, DOC, DOCX — 5 Mo max)</label>
        <input
          id="cv"
          name="cv"
          type="file"
          accept=".pdf,.doc,.docx,application/pdf"
          className="block w-full text-[13px] file:mr-4 file:py-2.5 file:px-4 file:rounded-full file:border-0 file:font-pro file:font-bold file:bg-vert file:text-white hover:file:bg-vert-dark"
        />
      </div>

      <label className="flex items-start gap-3 text-[13px] text-neutral-600 cursor-pointer">
        <input type="checkbox" name="rgpd" required className="mt-0.5 accent-vert" />
        <span>
          J'accepte que mes données personnelles soient utilisées pour traiter ma candidature.
          <a href="/mentions-legales" className="underline underline-offset-2 hover:text-vert">Mentions légales</a>. *
        </span>
      </label>

      {status === "error" && (
        <div className="bg-rouge/10 border border-rouge/20 text-rouge text-[13.5px] rounded-xl p-3">
          {errorMsg}
        </div>
      )}

      <button type="submit" disabled={status === "sending"} className="btn btn-primary w-full justify-center disabled:opacity-60">
        {status === "sending" ? "Envoi…" : "Envoyer ma candidature"}
      </button>

      <style>{`
        .input {
          display: block;
          width: 100%;
          border-radius: 14px;
          border: 1px solid rgba(0,0,0,0.12);
          background: #F7F5F0;
          padding: 12px 14px;
          font-size: 14.5px;
          font-family: inherit;
          transition: border-color .15s, box-shadow .15s;
        }
        .input:focus {
          outline: none;
          border-color: #1C6B35;
          box-shadow: 0 0 0 3px rgba(28, 107, 53, 0.1);
        }
      `}</style>
    </form>
  );
}
