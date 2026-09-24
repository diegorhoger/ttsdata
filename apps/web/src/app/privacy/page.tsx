export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-16">
      <h1 className="text-4xl font-bold text-slate-900 mb-8">Política de Privacidade</h1>
      <div className="prose prose-slate max-w-none space-y-6 text-slate-700">
        <p><strong>Última atualização:</strong> 24 de setembro de 2026</p>

        <h2 className="text-2xl font-semibold text-slate-900">1. Informações Coletadas</h2>
        <p>
          A TTSData coleta informações do TikTok Display API mediante autorização explícita do usuário.
          Coletamos apenas dados do perfil público e vídeos públicos do usuário conectado.
        </p>
        <ul className="list-disc pl-6 space-y-2">
          <li>Informações básicas de perfil (nome de usuário, avatar, contagem de seguidores)</li>
          <li>Lista de vídeos públicos (títulos, contagens de visualização, curtidas, comentários)</li>
          <li>Dados de engajamento agregados</li>
        </ul>

        <h2 className="text-2xl font-semibold text-slate-900">2. Uso dos Dados</h2>
        <p>
          Os dados coletados são utilizados exclusivamente para:
        </p>
        <ul className="list-disc pl-6 space-y-2">
          <li>Fornecer análises de performance do próprio usuário</li>
          <li>Calcular métricas de engajamento do criador</li>
          <li>Gerar relatórios de tendências baseados no histórico do usuário</li>
        </ul>
        <p>
          <strong>Não</strong> coletamos, armazenamos ou processamos dados de outros usuários do TikTok,
          dados de produtos, pedidos, comissões ou qualquer informação do TikTok Shop.
        </p>

        <h2 className="text-2xl font-semibold text-slate-900">3. Armazenamento e Retenção</h2>
        <p>
          Os dados do usuário são armazenados em servidores seguros e criptografados.
          Os usuários podem solicitar a exclusão completa de seus dados a qualquer momento
          através das configurações da conta ou entrando em contato conosco.
        </p>

        <h2 className="text-2xl font-semibold text-slate-900">4. Compartilhamento</h2>
        <p>
          Não compartilhamos dados individuais de usuários com terceiros.
        </p>

        <h2 className="text-2xl font-semibold text-slate-900">5. Direitos do Usuário</h2>
        <p>O usuário tem direito de:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li>Acessar todos os dados armazenados</li>
          <li>Solicitar correção de dados incorretos</li>
          <li>Solicitar exclusão completa dos dados (right to be forgotten)</li>
          <li>Revogar autorização do TikTok a qualquer momento</li>
          <li>Exportar seus dados em formato estruturado</li>
        </ul>

        <h2 className="text-2xl font-semibold text-slate-900">6. Contato</h2>
        <p>
          Para questões sobre privacidade, entre em contato: contato@ttsdata.netlify.app
        </p>
      </div>
    </div>
  );
}
