export default function TermsPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-16">
      <h1 className="text-4xl font-bold text-slate-900 mb-8">Termos de Serviço</h1>
      <div className="prose prose-slate max-w-none space-y-6 text-slate-700">
        <p><strong>Última atualização:</strong> 24 de setembro de 2026</p>

        <h2 className="text-2xl font-semibold text-slate-900">1. Aceitação dos Termos</h2>
        <p>
          Ao utilizar a TTSData, você concorda com estes Termos de Serviço.
          Se você não concordar com estes termos, não utilize nossa plataforma.
        </p>

        <h2 className="text-2xl font-semibold text-slate-900">2. Descrição do Serviço</h2>
        <p>
          A TTSData é uma plataforma de inteligência de mercado para criadores TikTok Shop no Brasil.
          O serviço utiliza APIs oficiais do TikTok para fornecer análises de performance e tendências.
        </p>

        <h2 className="text-2xl font-semibold text-slate-900">3. Elegibilidade</h2>
        <p>
          Você deve ter pelo menos 18 anos e possuir uma conta TikTok ativa para utilizar a plataforma.
          Criadores residentes no Brasil são o público-alvo principal.
        </p>

        <h2 className="text-2xl font-semibold text-slate-900">4. Conta e Segurança</h2>
        <p>
          Você é responsável por manter a segurança de sua conta TTSData e por todas as atividades
          realizadas sob sua credenciais. Notifique-nos imediatamente sobre qualquer uso não autorizado.
        </p>

        <h2 className="text-2xl font-semibold text-slate-900">5. Uso Aceitável</h2>
        <p>Você concorda em não:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li>Violar os Termos de Serviço do TikTok</li>
          <li>Tentar acessar dados de outros usuários sem autorização</li>
          <li>Usar a plataforma para fins ilegais ou fraudulentos</li>
          <li>Realizar engenharia reversa ou tentar extrair código-fonte</li>
          <li>Sofrer ataques de negação de serviço ou ataques de força bruta</li>
        </ul>

        <h2 className="text-2xl font-semibold text-slate-900">6. APIs de Terceiros</h2>
        <p>
          A plataforma integra-se à TikTok Display API.
          O uso desta API está sujeito aos termos e políticas da TikTok.
        </p>

        <h2 className="text-2xl font-semibold text-slate-900">7. Limitação de Responsabilidade</h2>
        <p>
          A TTSData não garante a disponibilidade contínua do servicio ou a precisão dos dados fornecidos
          por APIs de terceiros. Não nos responsabilizamos por decisões tomadas com base nas análises
          fornecidas pela plataforma.
        </p>

        <h2 className="text-2xl font-semibold text-slate-900">8. Modificações</h2>
        <p>
          Podemos atualizar estes termos periodicamente. Mudanças significativas serão comunicadas
          por email ou notificação na plataforma com pelo menos 30 dias de antecedência.
        </p>

        <h2 className="text-2xl font-semibold text-slate-900">9. Lei Aplicável</h2>
        <p>
          Estes termos são regidos pelas leis da República Federativa do Brasil.
          Disputas serão resolvidas no foro da comarca de São Paulo, SP.
        </p>

        <h2 className="text-2xl font-semibold text-slate-900">10. Contato</h2>
        <p>
          Para questões sobre estes termos: contato@ttsdata.netlify.app
        </p>
      </div>
    </div>
  );
}
