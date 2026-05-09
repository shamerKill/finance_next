"use client";

import { Input } from '@heroui/react';
import { FC } from 'react';

const PageOption: FC = () => {
  return (
    <div className='mx-4'>
      <div className='max-w-xl mx-auto mt-4'>
        <Input
          className='mt-4'
          type="text"
          label="名字"></Input>
        <Input
          className='mt-4'
          type="number"
          label="杠杆倍数"></Input>
        <Input
          className='mt-4'
          type="number"
          label="未开仓停止时间"></Input>
      </div>
    </div>
  );
};

export default PageOption;
