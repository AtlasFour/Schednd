import { revalidatePath } from "next/cache";

/**
 * Da chiamare nelle Server Actions dopo ogni modifica ai dati.
 * Aggiorna subito la pagina aperta e svuota la cache del browser, così
 * anche le altre pagine (home, gruppo, incontro) mostrano dati aggiornati
 * quando ci si torna, senza dover uscire e rientrare.
 */
export function revalidateApp() {
  revalidatePath("/", "layout");
}
