import { getOptions } from '@/data/data';
import { FC } from 'react';

export const dynamic = 'force-dynamic';

const PageApiList: FC = async () => {
  const options = await getOptions();
  console.log(options);
  return (
    <div>
      
    </div>
  );
};

export default PageApiList;