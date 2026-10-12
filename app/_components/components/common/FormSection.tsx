interface FormSectionProps {
  title: string;
  children: React.ReactNode;
}

function FormSection({ title, children }: FormSectionProps) {
  return (
    <div className="mb-8">
      <h2 className="font-medium text-white sm:text-lg mb-3 sm:mb-4">
        {title}
      </h2>
      <div className="space-y-4 sm:space-y-5">{children}</div>
    </div>
  );
}
export default FormSection;
