import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { processNotificationQueue } from "./notifications/process";

/**
 * Da chiamare nelle Server Actions dopo ogni modifica ai dati:
 * - aggiorna subito la pagina aperta e svuota la cache del browser, così le
 *   altre pagine (home, gruppo, incontro) mostrano dati aggiornati;
 * - dopo la risposta, invia le notifiche che la modifica ha messo in coda.
 */
export function afterMutation() {
  revalidatePath("/", "layout");
  after(async () => {
    try {
      await processNotificationQueue();
    } catch (err) {
      console.error("processNotificationQueue", err);
    }
  });
}
